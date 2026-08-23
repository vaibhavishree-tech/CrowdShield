"""
Module 1: Real-Time Perception & Tracking Engine (tracker.py)

This script serves as the live computer vision core for the CrowdShield system. 
It utilizes YOLO11 and ByteTrack to perform real-time crowd detection, spatial 
zone mapping, and movement tracking. It computes critical crowd safety metrics 
(Fruin physical density, flow entropy, bottleneck detection) on the fly and 
streams the venue's live state as a JSON payload to the decision engine.
"""

print("Running tracker.py- main file of the perception module")
import cv2
import math
import json
from collections import deque
from datetime import datetime
import os
from ultralytics import YOLO
import sys

# 1. Video stream setup
PERCEPTION_DIR = os.path.dirname(os.path.abspath(__file__))
VIDEO_PATH = os.path.join(PERCEPTION_DIR, "videos", "demo.mp4")
cap = cv2.VideoCapture(VIDEO_PATH)
# CONFIGURATION
MODEL_NAME = "yolo11s.pt"

GRID_ROWS = 3
GRID_COLS = 3

MAX_PEOPLE_PER_ZONE = 8

MAX_TRACK_HISTORY = 10
MIN_MOVEMENT_PIXELS = 1.5

ENTROPY_WINDOW = 30
MIN_ENTROPY_OBSERVATIONS = 5
NUM_DIRECTION_BINS = 8

SMOOTHING_WINDOW = 10
SUSTAINED_THRESHOLD = 10

BOTTLENECK_DENSITY_THRESHOLD = 0.35

REFERENCE_SPEED = 150.0

BOTTLENECK_SPEED_THRESHOLD = (
    REFERENCE_SPEED * 0.30
)

MIN_REVERSE_FLOW_OBSERVATIONS = 10
REVERSE_FLOW_FRACTION = 0.25
# RISK THRESHOLDS
RISK_DENSITY_LOW = 0.10
RISK_DENSITY_MEDIUM = 0.25
RISK_DENSITY_HIGH = 0.40
RISK_DENSITY_CRITICAL = 0.60

RISK_DENSITY_INCREASE = 0.02

RISK_ENTROPY_MEDIUM = 0.25
RISK_ENTROPY_HIGH = 0.45
RISK_ENTROPY_CRITICAL = 0.80

RISK_LABELS = {
    0: "NORMAL",
    1: "ELEVATED",
    2: "CONGESTED",
    3: "HIGH_RISK",
    4: "CRITICAL"
}

# Real-world estimated area (in m^2) for each zone accounting for camera perspective
# Row 1 (Far/Top): ~35 m^2 | Row 2 (Mid): ~25 m^2 | Row 3 (Near/Bottom): ~15 m^2
ZONE_AREAS_M2 = {
    1: 35.0, 2: 35.0, 3: 35.0,  # Top row (Far)
    4: 25.0, 5: 25.0, 6: 25.0,  # Middle row
    7: 15.0, 8: 15.0, 9: 15.0   # Bottom row (Near)
}

# Scientific Density Thresholds (Fruin Level of Service)
# Critical crush risk begins around 4.0 people/m^2
CRITICAL_PHYSICAL_DENSITY = 1.5

model = YOLO(MODEL_NAME)

# ============================================================
# GLOBAL STATE
# ============================================================

frame_number = 0

fps = 30.0

frame_width = 1920
frame_height = 1080

track_history = {} # PERSON TRACK HISTORY

# FLOW HISTORY FOR EACH ZONE

zone_flow_history = {

    zone_id: deque(
        maxlen=ENTROPY_WINDOW
    )

    for zone_id in range(
        1,
        GRID_ROWS * GRID_COLS + 1
    )
}

# TEMPORAL HISTORY

zone_temporal_history = {

    zone_id: {

        "density": deque(
            maxlen=SMOOTHING_WINDOW
        ),

        "speed": deque(
            maxlen=SMOOTHING_WINDOW
        ),

        "smoothed_density": deque(
            maxlen=SMOOTHING_WINDOW
        ),

        "smoothed_speed": deque(
            maxlen=SMOOTHING_WINDOW
        ),

        "bottleneck": deque(
            maxlen=SUSTAINED_THRESHOLD
        ),

        "reverse_flow": deque(
            maxlen=SUSTAINED_THRESHOLD
        )

    }

    for zone_id in range(
        1,
        GRID_ROWS * GRID_COLS + 1
    )
}

# GET ZONE

def get_zone(cx, cy, current_w, current_h):
    zone_width = current_w / GRID_COLS
    zone_height = current_h / GRID_ROWS

    col = min(int(cx / zone_width), GRID_COLS - 1)
    row = min(int(cy / zone_height), GRID_ROWS - 1)

    return row * GRID_COLS + col + 1

# MOVEMENT

def calculate_movement(
    previous_point,
    current_point
):

    px, py = previous_point

    cx, cy = current_point

    dx = cx - px
    dy = cy - py

    distance = math.sqrt(
        dx ** 2 +
        dy ** 2
    )

    return dx, dy, distance

# DIRECTION BIN

def get_direction_bin(dx, dy):

    angle = math.atan2(
        dy,
        dx
    )

    degrees = math.degrees(
        angle
    )

    degrees += 22.5

    if degrees < 0:

        degrees += 360

    return (
        int(degrees // 45)
        % NUM_DIRECTION_BINS
    )

# FLOW ENTROPY

def calculate_flow_entropy(
    direction_history
):

    if len(
        direction_history
    ) < MIN_ENTROPY_OBSERVATIONS:

        return 0.0

    counts = [
        0
    ] * NUM_DIRECTION_BINS

    for direction in direction_history:

        counts[direction] += 1

    total = sum(counts)

    if total == 0:

        return 0.0

    entropy = 0.0

    for count in counts:

        if count == 0:

            continue

        probability = (
            count / total
        )

        entropy -= (
            probability *
            math.log(probability)
        )

    maximum_entropy = math.log(
        NUM_DIRECTION_BINS
    )

    return (
        entropy /
        maximum_entropy
    )


# ============================================================
# MOVING AVERAGE
# ============================================================

def moving_average(history):

    if not history:

        return 0.0

    return (
        sum(history) /
        len(history)
    )


# ============================================================
# CHANGE
# ============================================================

def calculate_change(history):

    if len(history) < 2:

        return 0.0

    return (
        history[-1] -
        history[-2]
    )


# ============================================================
# BOTTLENECK
# ============================================================

def detect_bottleneck(
    density,
    speed
):

    return (

        density >=
        BOTTLENECK_DENSITY_THRESHOLD

        and

        speed <=
        BOTTLENECK_SPEED_THRESHOLD
    )


# ============================================================
# SUSTAINED CONDITION
# ============================================================

def sustained_condition(history):

    if len(history) < SUSTAINED_THRESHOLD:

        return False

    recent = list(history)[
        -SUSTAINED_THRESHOLD:
    ]

    return all(recent)


# ============================================================
# REVERSE FLOW
# ============================================================

def detect_reverse_flow(
    direction_history
):

    if len(
        direction_history
    ) < MIN_REVERSE_FLOW_OBSERVATIONS:

        return False

    counts = [
        0
    ] * NUM_DIRECTION_BINS

    for direction in direction_history:

        counts[direction] += 1

    dominant_direction = max(
        range(NUM_DIRECTION_BINS),
        key=lambda i: counts[i]
    )

    opposite_direction = (
        dominant_direction + 4
    ) % NUM_DIRECTION_BINS

    total = sum(counts)

    if total == 0:

        return False

    opposite_fraction = (
        counts[
            opposite_direction
        ] / total
    )

    return (
        opposite_fraction >=
        REVERSE_FLOW_FRACTION
    )


# ============================================================
# RISK ENGINE
# ============================================================

def calculate_risk_score(
    density,
    density_change,
    speed,
    entropy,
    bottleneck,
    reverse_flow
):

    score = 0

    reasons = []


    # --------------------------------------------------------
    # VERY LOW DENSITY
    # --------------------------------------------------------

    if density < 0.08:

        return (
            0,
            "NORMAL",
            []
        )


    # --------------------------------------------------------
    # DENSITY
    # --------------------------------------------------------

    if density >= RISK_DENSITY_CRITICAL:

        score += 3

        reasons.append(
            "critical_density"
        )

    elif density >= RISK_DENSITY_HIGH:

        score += 2

        reasons.append(
            "high_density"
        )

    elif density >= RISK_DENSITY_MEDIUM:

        score += 1

        reasons.append(
            "medium_density"
        )


    # --------------------------------------------------------
    # DENSITY INCREASE
    # --------------------------------------------------------

    if (
        density >= RISK_DENSITY_LOW
        and
        density_change >=
        RISK_DENSITY_INCREASE
    ):

        score += 1

        reasons.append(
            "density_increasing"
        )


    # --------------------------------------------------------
    # DENSE + SLOW
    # --------------------------------------------------------

    if (
        density >= RISK_DENSITY_MEDIUM
        and
        speed <= 45
    ):

        score += 2

        reasons.append(
            "dense_slow_movement"
        )


    # --------------------------------------------------------
    # FLOW ENTROPY
    # --------------------------------------------------------

    if density >= RISK_DENSITY_MEDIUM:

        if entropy >= RISK_ENTROPY_CRITICAL:

            score += 2

            reasons.append(
                "very_disordered_flow"
            )

        elif entropy >= RISK_ENTROPY_HIGH:

            score += 1

            reasons.append(
                "high_flow_entropy"
            )

        elif entropy >= RISK_ENTROPY_MEDIUM:

            score += 1

            reasons.append(
                "moderate_flow_entropy"
            )


    # --------------------------------------------------------
    # BOTTLENECK
    # --------------------------------------------------------

    if bottleneck:

        score += 2

        reasons.append(
            "bottleneck"
        )


    # --------------------------------------------------------
    # REVERSE FLOW
    # --------------------------------------------------------

    if (
        reverse_flow
        and
        density >= RISK_DENSITY_MEDIUM
    ):

        score += 2

        reasons.append(
            "reverse_flow"
        )


    # --------------------------------------------------------
    # LIMIT SCORE
    # --------------------------------------------------------

    score = min(
        score,
        4
    )

    return (
        score,
        RISK_LABELS[score],
        reasons
    )


# ============================================================
# PROCESS ONE FRAME
# ============================================================

def process_frame(frame=None):
    global frame_number,cap
    # If no external frame array is passed, read the next frame from the video
    if frame is None:

        ret, frame = cap.read()

        # Continuous loop: restart video when it ends

        if not ret:

            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

            ret, frame = cap.read()

        if not ret or frame is None:

            return {}, None  # Guard check if video fails to load

    frame_number += 1
    # ========================================================
    # YOLO + BYTETRACK
    # ========================================================

    results = model.track(
        frame,
        persist=True,
        tracker="bytetrack.yaml",
        classes=[0],
        imgsz=640,
        conf=0.15,
        device=0,
        verbose=False
    )
    result = results[0]
    # ========================================================
    # INITIALIZE ZONES
    # ========================================================
    zone_data = {}
    for zone_id in range(

        1,

        GRID_ROWS * GRID_COLS + 1

    ):
        zone_data[zone_id] = {
            "zone_id": zone_id,
            "people_count": 0,
            "density": 0.0,
            "physical_density": 0.0,
            "density_trend": 0.0,
            "avg_speed": 0.0,
            "acceleration": 0.0,
            "flow_direction": [
                0.0,
                0.0
            ],
            "flow_entropy": 0.0,
            "bottleneck": False,
            "reverse_flow": False,
            "risk_level": 0,
            "risk_label": "NORMAL",
            "risk_reasons": []
        }
    # ========================================================
    # PROCESS DETECTIONS
    # ========================================================
    # Dynamically get the actual frame dimensions
    current_h, current_w = frame.shape[:2]
    # Count EVERYONE YOLO detected, even without tracking IDs
    if result.boxes.xyxy is not None and len(result.boxes.xyxy) > 0:

        boxes = result.boxes.xyxy.cpu().numpy()
        # Safely extract IDs if they exist, otherwise create an array of Nones
        track_ids = result.boxes.id.int().cpu().numpy() if result.boxes.id is not None else [None] * len(boxes)
        for box, track_id in zip(boxes, track_ids):
            x1, y1, x2, y2 = box
            # 1. CENTROID

            cx = int((x1 + x2) / 2)

            cy = int((y1 + y2) / 2)

            # 2. ZONE ASSIGNMENT (Using dynamic dimensions)
            zone_id = get_zone(cx, cy, current_w, current_h)

            # Count the person immediately
            zone_data[zone_id]["people_count"] += 1



            # 3. TRACK HISTORY (Only calculate speed/flow if an ID exists)
            if track_id is not None:
                if track_id not in track_history:
                    track_history[track_id] = []

                history = track_history[track_id]

                if len(history) > 0:

                    previous_point = history[-1]

                    dx, dy, distance = calculate_movement(previous_point, (cx, cy))



                    if distance >= MIN_MOVEMENT_PIXELS:

                        data = zone_data[zone_id]

                        data["_dx"] = data.get("_dx", 0.0) + dx

                        data["_dy"] = data.get("_dy", 0.0) + dy

                        data["_distance"] = data.get("_distance", 0.0) + distance

                        data["_movements"] = data.get("_movements", 0) + 1



                        direction = get_direction_bin(dx, dy)

                        zone_flow_history[zone_id].append(direction)
                # SAVE POSITION

                history.append((cx, cy))

                if len(history) > MAX_TRACK_HISTORY:

                    history.pop(0)

    # ========================================================
    # CALCULATE FEATURES
    # ========================================================
    for zone_id in zone_data:
        
        data = zone_data[

            zone_id

        ]
        temporal = (

            zone_temporal_history[

                zone_id

            ]

        )
        # ----------------------------------------------------
        # DENSITY
        # ----------------------------------------------------

        people_count = data["people_count"]
        
        # 1. Calculate true physical density (people per square meter)
        zone_area = ZONE_AREAS_M2.get(zone_id, 25.0)
        physical_density = people_count / zone_area  # e.g., 2.5 p/m^2
        
        # 2. Normalize to [0.0, 1.0] relative to Critical Crush Density (4.0 p/m^2)
        # This keeps all downstream risk formulas (0 to 1 scale) completely intact!
        normalized_density = min(physical_density / CRITICAL_PHYSICAL_DENSITY, 1.0)
        density = normalized_density
        # Store normalized density for risk thresholds and physical density for UI details
        data["density"] = round(normalized_density, 4)
        data["physical_density"] = round(physical_density, 2)  # Raw p/m^2

        # ----------------------------------------------------
        # SPEED
        # ----------------------------------------------------
        movements = data.get(

            "_movements",

            0

        )
        if movements > 0:
            avg_distance = (

                data[

                    "_distance"

                ] /

                movements

            )
            avg_speed = (

                avg_distance *

                fps

            )
        else:
            avg_speed = 0.0
        # ----------------------------------------------------
        # FLOW DIRECTION
        # ----------------------------------------------------
        if movements > 0:
            avg_dx = (

                data[

                    "_dx"

                ] /

                movements

            )
            avg_dy = (

                data[

                    "_dy"

                ] /

                movements

            )
            magnitude = math.sqrt(

                avg_dx ** 2 +

                avg_dy ** 2

            )
            if magnitude > 0:



                flow_x = (

                    avg_dx /

                    magnitude

                )
                flow_y = (

                    avg_dy /

                    magnitude

                )
            else:



                flow_x = 0.0

                flow_y = 0.0
            data[

                "flow_direction"

            ] = [
                round(

                    flow_x,

                    3

                ),



                round(

                    flow_y,

                    3

                )

            ]
        # ----------------------------------------------------
        # FLOW ENTROPY (With Zero-Person Activity Gate)
        # ----------------------------------------------------
        if people_count == 0:
            # Clear historical directional memory so empty zones report zero entropy
            zone_flow_history[zone_id].clear()
            entropy = 0.0
        else:
            entropy = calculate_flow_entropy(
                zone_flow_history[zone_id]
            )

        data["flow_entropy"] = round(entropy, 4)

        # ----------------------------------------------------
        # TEMPORAL HISTORY
        # ----------------------------------------------------
        temporal[

            "density"

        ].append(

            density

        )
        temporal[

            "speed"

        ].append(

            avg_speed

        )
        # ----------------------------------------------------
        # SMOOTHED DENSITY
        # ----------------------------------------------------
        smoothed_density = (

            moving_average(

                temporal[

                    "density"

                ]

            )

        )
        temporal[

            "smoothed_density"

        ].append(

            smoothed_density

        )
        # ----------------------------------------------------
        # SMOOTHED SPEED
        # ----------------------------------------------------
        smoothed_speed = (

            moving_average(

                temporal[

                    "speed"

                ]

            )

        )
        temporal[

            "smoothed_speed"

        ].append(

            smoothed_speed

        )
        # ----------------------------------------------------
        # DENSITY TREND
        # ----------------------------------------------------
        density_trend = (

            calculate_change(

                temporal[

                    "smoothed_density"

                ]

            )

        )
        data[

            "density_trend"

        ] = round(

            density_trend,

            4

        )
        # ----------------------------------------------------
        # ACCELERATION
        # ----------------------------------------------------
        if len(

            temporal[

                "smoothed_speed"

            ]

        ) >= 2:
            previous_speed = (

                temporal[

                    "smoothed_speed"

                ][-2]

            )
            acceleration = (

                smoothed_speed -

                previous_speed

            ) * fps
        else:



            acceleration = 0.0

        data[

            "acceleration"

        ] = round(

            acceleration,

            2

        )
        # ----------------------------------------------------
        # BOTTLENECK
        # ----------------------------------------------------
        bottleneck_now = (

            detect_bottleneck(

                smoothed_density,

                smoothed_speed

            )

        )
        temporal[

            "bottleneck"

        ].append(

            bottleneck_now

        )
        data[

            "bottleneck"

        ] = sustained_condition(

            temporal[

                "bottleneck"

            ]

        )
        # ----------------------------------------------------
        # REVERSE FLOW
        # ----------------------------------------------------
        reverse_now = (

            detect_reverse_flow(

                zone_flow_history[

                    zone_id

                ]

            )

        )
        temporal[

            "reverse_flow"

        ].append(

            reverse_now

        )
        data[

            "reverse_flow"

        ] = sustained_condition(

            temporal[

                "reverse_flow"

            ]

        )
        # ----------------------------------------------------
        # RISK
        # ----------------------------------------------------
        (

            risk_score,

            risk_label,

            risk_reasons

        ) = calculate_risk_score(



            density=smoothed_density,



            density_change=density_trend,



            speed=smoothed_speed,



            entropy=entropy,



            bottleneck=data[

                "bottleneck"

            ],



            reverse_flow=data[

                "reverse_flow"

            ]

        )


        data[

            "risk_level"

        ] = risk_score



        data[

            "risk_label"

        ] = risk_label



        data[

            "risk_reasons"

        ] = risk_reasons



        data[

            "avg_speed"

        ] = round(

            smoothed_speed,

            2

        )
    # ========================================================
    # CREATE CLEAN ZONE OUTPUT
    # ========================================================
    zones = []
    for zone_id in range(

        1,

        GRID_ROWS * GRID_COLS + 1

    ):



        data = zone_data[

            zone_id

        ]





        zones.append({



            "zone_id":

                data[

                    "zone_id"

                ],



            "people_count":

                data[

                    "people_count"

                ],



            "density":

                round(

                    data[

                        "density"

                    ],

                    4

                ),
            "physical_density": data["physical_density"],
            "density_trend":

                data[

                    "density_trend"

                ],
            "avg_speed":

                data[

                    "avg_speed"

                ],
            "acceleration":

                data[

                    "acceleration"

                ],
            "flow_direction":

                data[

                    "flow_direction"

                ],
            "flow_entropy":

                data[

                    "flow_entropy"

                ],
            "bottleneck":

                data[

                    "bottleneck"

                ],
            "reverse_flow":

                data[

                    "reverse_flow"
                ],
            "risk_level":

                data[

                    "risk_level"

                ],
            "risk_label":

                data[

                    "risk_label"

                ],
            "risk_reasons":

                data[

                    "risk_reasons"

                ]

        })
    # ========================================================
    # OVERALL RISK
    # ========================================================
    highest_risk_zone = max(

        zones,

        key=lambda zone:

        zone[

            "risk_level"

        ]

    )
    overall_risk_level = (

        highest_risk_zone[

            "risk_level"

        ]

    )
    # ========================================================
    # FINAL MODULE 1 OUTPUT
    # ========================================================
    output = {
        "timestamp":datetime.now().isoformat(),
        "zones": zones,
        "overall_risk_level": overall_risk_level,
        "overall_risk_label":
            RISK_LABELS[overall_risk_level],
        "highest_risk_zone":highest_risk_zone["zone_id"]
    }
    return output,result 


# ============================================================
# DRAW GRID
# ============================================================

def draw_grid(frame):

    zone_width = (
        frame_width /
        GRID_COLS
    )

    zone_height = (
        frame_height /
        GRID_ROWS
    )


    for row in range(
        GRID_ROWS
    ):

        for col in range(
            GRID_COLS
        ):

            x1 = int(
                col *
                zone_width
            )

            y1 = int(
                row *
                zone_height
            )

            x2 = int(
                (col + 1) *
                zone_width
            )

            y2 = int(
                (row + 1) *
                zone_height
            )


            cv2.rectangle(
                frame,
                (x1, y1),
                (x2, y2),
                (255, 255, 255),
                2
            )


            zone_id = (
                row *
                GRID_COLS
                + col
                + 1
            )


            cv2.putText(
                frame,

                f"Z{zone_id}",

                (
                    x1 + 15,
                    y1 + 35
                ),

                cv2.FONT_HERSHEY_SIMPLEX,

                0.8,

                (255, 255, 255),

                2
            )


    return frame


# ============================================================
# MAIN / LOCAL VIDEO TEST
# ============================================================

if __name__ == "__main__":

    # --------------------------------------------------------
    # OPEN VIDEO
    # --------------------------------------------------------

    cap = cv2.VideoCapture(
        VIDEO_PATH
    )


    if not cap.isOpened():

        print(
            "Error: Could not open video."
        )

        exit()


    # --------------------------------------------------------
    # VIDEO INFORMATION
    # --------------------------------------------------------

    frame_width = int(
        cap.get(
            cv2.CAP_PROP_FRAME_WIDTH
        )
    )

    frame_height = int(
        cap.get(
            cv2.CAP_PROP_FRAME_HEIGHT
        )
    )

    detected_fps = cap.get(
        cv2.CAP_PROP_FPS
    )


    if detected_fps > 0:

        fps = detected_fps


    print()
    print("=" * 80)
    print("CROWDSHIELD - MODULE 1")
    print("=" * 80)

    print(
        f"Video size: "
        f"{frame_width} x "
        f"{frame_height}"
    )

    print(
        f"FPS: {fps}"
    )

    print()
    print(
        "Processing video..."
    )

    print(
        "Press Q to quit."
    )

    print()


    # --------------------------------------------------------
    # VIDEO LOOP
    # --------------------------------------------------------

    while True:

        success, frame = (
            cap.read()
        )


        if not success:

            break


        # ====================================================
        # PROCESS FRAME
        # ====================================================

        state,result = process_frame(
            frame
        )


        # ====================================================
        # PRINT JSON
        # ====================================================

        print()
        print("=" * 80)

        print(
            f"FRAME {frame_number}"
        )

        print("=" * 80)

        print(
            json.dumps(
                state,
                indent=2
            )
        )


        # ====================================================
        # DRAW YOLO RESULTS
        # ====================================================

        # We already ran YOLO inside process_frame().
        #
        # Run it again ONLY to obtain the visualization.
        #
        # This is not ideal for performance, but keeps the
        # process_frame() interface completely independent.

        display_results = model.track(

            frame,

            persist=True,

            tracker="bytetrack.yaml",

            classes=[0],

            imgsz=1280,

            conf=0.25,

            verbose=False
        )


        display_result = (
            display_results[0]
        )


        annotated_frame = display_result.plot()


        # ====================================================
        # GRID
        # ====================================================

        annotated_frame = (
            draw_grid(
                annotated_frame
            )
        )


        # ====================================================
        # ZONE RISK LABELS
        # ====================================================

        zone_width = (
            frame_width /
            GRID_COLS
        )

        zone_height = (
            frame_height /
            GRID_ROWS
        )


        for zone in state[
            "zones"
        ]:

            zone_id = (
                zone[
                    "zone_id"
                ]
            )

            index = (
                zone_id - 1
            )

            row = (
                index //
                GRID_COLS
            )

            col = (
                index %
                GRID_COLS
            )

            x1 = int(
                col *
                zone_width
            )

            y1 = int(
                row *
                zone_height
            )


            text = (
                f"R"
                f"{zone['risk_level']} "
                f"{zone['risk_label']}"
            )


            cv2.putText(

                annotated_frame,

                text,

                (
                    x1 + 15,
                    y1 + 65
                ),

                cv2.FONT_HERSHEY_SIMPLEX,

                0.55,

                (0, 255, 255),

                2
            )


        # ====================================================
        # OVERALL RISK
        # ====================================================

        cv2.rectangle(

            annotated_frame,

            (10, 10),

            (600, 65),

            (0, 0, 0),

            -1
        )


        cv2.putText(

            annotated_frame,

            (
                f"OVERALL: "
                f"R{state['overall_risk_level']} "
                f"{state['overall_risk_label']} "
                f"| ZONE "
                f"{state['highest_risk_zone']}"
            ),

            (20, 48),

            cv2.FONT_HERSHEY_SIMPLEX,

            0.65,

            (255, 255, 255),

            2
        )


        # ====================================================
        # DISPLAY
        # ====================================================

        display_frame = cv2.resize(

            annotated_frame,

            (1280, 720)
        )


        cv2.imshow(

            "CrowdShield - Module 1",

            display_frame
        )


        # ====================================================
        # QUIT
        # ====================================================

        if (
            cv2.waitKey(1) & 0xFF
            == ord("q")
        ):

            break


    # --------------------------------------------------------
    # CLEANUP
    # --------------------------------------------------------

    cap.release()

    cv2.destroyAllWindows()


    print()
    print("=" * 80)
    print("MODULE 1 FINISHED")
    print("=" * 80)

    print(
        f"Frames processed: "
        f"{frame_number}"
    )