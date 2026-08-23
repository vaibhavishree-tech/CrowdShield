"""
Module 1: Telemetry & Historical Event Logger
-------------------------------------------------------------
This script mirrors the core computer vision logic of the live perception engine 
but is dedicated to offline analytics and system telemetry. Instead of broadcasting 
live JSON states, it continuously serializes granular spatial metrics and discrete 
risk escalation events into local CSV datasets (zone_features.csv, risk_events.csv). 
This data is used for threshold tuning, post-event auditing, and algorithm validation.
"""

import cv2
import math
import csv
import os

from collections import deque
from datetime import datetime

from ultralytics import YOLO


# ============================================================
# CONFIGURATION
# ============================================================

MODEL_NAME = "yolo11s.pt"
VIDEO_PATH = "videos/demo.mp4"


# ============================================================
# OUTPUT
# ============================================================

DATA_FOLDER = "data"

ZONE_CSV_FILE = os.path.join(
    DATA_FOLDER,
    "zone_features.csv"
)

EVENT_CSV_FILE = os.path.join(
    DATA_FOLDER,
    "risk_events.csv"
)

os.makedirs(
    DATA_FOLDER,
    exist_ok=True
)


# ============================================================
# GRID
# ============================================================

GRID_ROWS = 3
GRID_COLS = 3


# ============================================================
# DENSITY
# ============================================================

MAX_PEOPLE_PER_ZONE = 25


# ============================================================
# TRACKING
# ============================================================

MAX_TRACK_HISTORY = 10

MIN_MOVEMENT_PIXELS = 1.5


# ============================================================
# FLOW ENTROPY
# ============================================================

ENTROPY_WINDOW = 30

MIN_ENTROPY_OBSERVATIONS = 5

NUM_DIRECTION_BINS = 8


# ============================================================
# TEMPORAL SMOOTHING
# ============================================================

SMOOTHING_WINDOW = 10

SUSTAINED_THRESHOLD = 10


# ============================================================
# BOTTLENECK
# ============================================================

BOTTLENECK_DENSITY_THRESHOLD = 0.60

REFERENCE_SPEED = 150.0

BOTTLENECK_SPEED_RATIO = 0.30

BOTTLENECK_SPEED_THRESHOLD = (
    REFERENCE_SPEED *
    BOTTLENECK_SPEED_RATIO
)


# ============================================================
# REVERSE FLOW
# ============================================================

MIN_REVERSE_FLOW_OBSERVATIONS = 10

REVERSE_FLOW_FRACTION = 0.25


# ============================================================
# RISK SCORE
# ============================================================

RISK_DENSITY_LOW = 0.20

RISK_DENSITY_MEDIUM = 0.40

RISK_DENSITY_HIGH = 0.60

RISK_DENSITY_CRITICAL = 0.80

RISK_DENSITY_INCREASE = 0.02

RISK_ENTROPY_MEDIUM = 0.40

RISK_ENTROPY_HIGH = 0.60

RISK_ENTROPY_CRITICAL = 0.80


# ============================================================
# RISK LABELS
# ============================================================

RISK_LABELS = {
    0: "NORMAL",
    1: "ELEVATED",
    2: "CONGESTED",
    3: "HIGH_RISK",
    4: "CRITICAL"
}


# ============================================================
# LOAD MODEL
# ============================================================

model = YOLO(MODEL_NAME)


# ============================================================
# OPEN VIDEO
# ============================================================

cap = cv2.VideoCapture(
    VIDEO_PATH
)

if not cap.isOpened():

    print(
        "Error: Could not open video."
    )

    exit()


# ============================================================
# VIDEO INFORMATION
# ============================================================

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

fps = cap.get(
    cv2.CAP_PROP_FPS
)

if fps <= 0:

    fps = 30


print(
    f"Video size: "
    f"{frame_width} x {frame_height}"
)

print(
    f"Video FPS: {fps}"
)

print(
    f"Zone CSV: {ZONE_CSV_FILE}"
)

print(
    f"Event CSV: {EVENT_CSV_FILE}"
)


# ============================================================
# TRACK HISTORY
# ============================================================

track_history = {}


# ============================================================
# FLOW HISTORY
# ============================================================

zone_flow_history = {

    zone_id: deque(
        maxlen=ENTROPY_WINDOW
    )

    for zone_id in range(
        1,
        GRID_ROWS * GRID_COLS + 1
    )
}


# ============================================================
# TEMPORAL HISTORY
# ============================================================

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

        "acceleration": deque(
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


# ============================================================
# PREVIOUS RISK STATE
# ============================================================

previous_risk = {

    zone_id: 0

    for zone_id in range(
        1,
        GRID_ROWS * GRID_COLS + 1
    )
}


# ============================================================
# CSV — ZONE FEATURES
# ============================================================

zone_csv = open(
    ZONE_CSV_FILE,
    mode="w",
    newline="",
    encoding="utf-8"
)

zone_writer = csv.writer(
    zone_csv
)

zone_writer.writerow([
    "timestamp",
    "frame",
    "zone_id",
    "people_count",
    "density",
    "density_change",
    "speed",
    "acceleration",
    "flow_x",
    "flow_y",
    "flow_entropy",
    "bottleneck",
    "reverse_flow",
    "risk_score",
    "risk_label"
])


# ============================================================
# CSV — RISK EVENTS
# ============================================================

event_csv = open(
    EVENT_CSV_FILE,
    mode="w",
    newline="",
    encoding="utf-8"
)

event_writer = csv.writer(
    event_csv
)

event_writer.writerow([
    "timestamp",
    "frame",
    "zone_id",
    "previous_risk",
    "new_risk",
    "previous_label",
    "new_label",
    "people_count",
    "density",
    "speed",
    "flow_entropy",
    "bottleneck",
    "reverse_flow",
    "reasons"
])


# ============================================================
# GET ZONE
# ============================================================

def get_zone(
    cx,
    cy,
    frame_width,
    frame_height
):

    zone_width = (
        frame_width /
        GRID_COLS
    )

    zone_height = (
        frame_height /
        GRID_ROWS
    )

    col = int(
        cx /
        zone_width
    )

    row = int(
        cy /
        zone_height
    )

    col = min(
        col,
        GRID_COLS - 1
    )

    row = min(
        row,
        GRID_ROWS - 1
    )

    zone_id = (
        row * GRID_COLS
        + col
        + 1
    )

    return zone_id


# ============================================================
# DRAW GRID
# ============================================================

def draw_grid(
    frame,
    frame_width,
    frame_height
):

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
                row * GRID_COLS
                + col
                + 1
            )

            cv2.putText(
                frame,
                f"Z{zone_id}",
                (x1 + 15, y1 + 35),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (255, 255, 255),
                2
            )

    return frame


# ============================================================
# MOVEMENT
# ============================================================

def calculate_movement(
    previous_point,
    current_point
):

    previous_x, previous_y = (
        previous_point
    )

    current_x, current_y = (
        current_point
    )

    dx = (
        current_x -
        previous_x
    )

    dy = (
        current_y -
        previous_y
    )

    distance = math.sqrt(
        dx ** 2 +
        dy ** 2
    )

    return (
        dx,
        dy,
        distance
    )


# ============================================================
# DIRECTION BIN
# ============================================================

def get_direction_bin(
    dx,
    dy
):

    angle = math.atan2(
        dy,
        dx
    )

    angle_degrees = math.degrees(
        angle
    )

    angle_degrees += 22.5

    if angle_degrees < 0:

        angle_degrees += 360

    direction_bin = int(
        angle_degrees // 45
    ) % 8

    return direction_bin


# ============================================================
# FLOW ENTROPY
# ============================================================

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

        counts[
            direction
        ] += 1

    total = sum(
        counts
    )

    if total == 0:

        return 0.0

    entropy = 0.0

    for count in counts:

        if count == 0:

            continue

        probability = (
            count /
            total
        )

        entropy -= (
            probability *
            math.log(
                probability
            )
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

def moving_average(
    history
):

    if len(history) == 0:

        return 0.0

    return (
        sum(history) /
        len(history)
    )


# ============================================================
# CHANGE
# ============================================================

def calculate_change(
    history
):

    if len(history) < 2:

        return 0.0

    return (
        history[-1] -
        history[-2]
    )


# ============================================================
# ACCELERATION
# ============================================================

def calculate_smoothed_acceleration(
    smoothed_speed_history
):

    if len(
        smoothed_speed_history
    ) < 2:

        return 0.0

    previous_speed = (
        smoothed_speed_history[-2]
    )

    current_speed = (
        smoothed_speed_history[-1]
    )

    speed_change = (
        current_speed -
        previous_speed
    )

    acceleration = (
        speed_change *
        fps
    )

    return acceleration


# ============================================================
# SUSTAINED CONDITION
# ============================================================

def sustained_condition(
    history
):

    if len(history) < SUSTAINED_THRESHOLD:

        return False

    recent = list(
        history
    )[-SUSTAINED_THRESHOLD:]

    return all(
        recent
    )


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

        counts[
            direction
        ] += 1

    dominant_direction = max(
        range(NUM_DIRECTION_BINS),
        key=lambda i: counts[i]
    )

    opposite_direction = (
        dominant_direction + 4
    ) % 8

    opposite_count = (
        counts[
            opposite_direction
        ]
    )

    total = sum(
        counts
    )

    if total == 0:

        return False

    opposite_fraction = (
        opposite_count /
        total
    )

    return (
        opposite_fraction >=
        REVERSE_FLOW_FRACTION
    )


# ============================================================
# BOTTLENECK
# ============================================================

def detect_bottleneck(
    smoothed_density,
    smoothed_speed
):

    high_density = (
        smoothed_density >=
        BOTTLENECK_DENSITY_THRESHOLD
    )

    low_speed = (
        smoothed_speed <=
        BOTTLENECK_SPEED_THRESHOLD
    )

    return (
        high_density and
        low_speed
    )


# ============================================================
# RISK SCORE
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
        speed <=
        BOTTLENECK_SPEED_THRESHOLD
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
        density >=
        RISK_DENSITY_MEDIUM
    ):

        score += 2

        reasons.append(
            "reverse_flow"
        )


    # --------------------------------------------------------
    # CAP SCORE
    # --------------------------------------------------------

    score = min(
        score,
        4
    )


    risk_label = RISK_LABELS[
        score
    ]


    return (
        score,
        risk_label,
        reasons
    )


# ============================================================
# FRAME COUNTER
# ============================================================

frame_number = 0


# ============================================================
# EVENT FUNCTION
# ============================================================

def record_risk_event(
    zone_id,
    frame_number,
    timestamp,
    previous_score,
    new_score,
    data
):

    previous_label = RISK_LABELS[
        previous_score
    ]

    new_label = RISK_LABELS[
        new_score
    ]


    reasons = ";".join(
        data[
            "risk_reasons"
        ]
    )


    event_writer.writerow([

        timestamp,

        frame_number,

        zone_id,

        previous_score,

        new_score,

        previous_label,

        new_label,

        data[
            "people_count"
        ],

        round(
            data[
                "smoothed_density"
            ],
            4
        ),

        round(
            data[
                "smoothed_speed"
            ],
            2
        ),

        round(
            data[
                "flow_entropy"
            ],
            4
        ),

        data[
            "bottleneck"
        ],

        data[
            "reverse_flow"
        ],

        reasons
    ])


    event_csv.flush()


    print(
        "\n"
        + "!" * 80
    )

    print(
        "RISK EVENT"
    )

    print(
        f"Zone: {zone_id}"
    )

    print(
        f"Frame: {frame_number}"
    )

    print(
        f"{previous_label} "
        f"-> "
        f"{new_label}"
    )

    print(
        f"Reasons: "
        f"{reasons}"
    )

    print(
        "!" * 80
    )


# ============================================================
# MAIN LOOP
# ============================================================

try:

    while True:

        # ====================================================
        # READ FRAME
        # ====================================================

        success, frame = (
            cap.read()
        )

        if not success:

            print(
                "Video ended."
            )

            break


        frame_number += 1


        # ====================================================
        # YOLO + BYTETRACK
        # ====================================================

        results = model.track(
            frame,
            persist=True,
            tracker="bytetrack.yaml",
            classes=[0],
            imgsz=1280,
            conf=0.25,
            verbose=False
        )

        result = results[0]


        # ====================================================
        # INITIALIZE ZONES
        # ====================================================

        zone_data = {}

        for zone_id in range(
            1,
            GRID_ROWS * GRID_COLS + 1
        ):

            zone_data[zone_id] = {

                "people_count": 0,

                "density": 0.0,

                "track_ids": [],

                "total_dx": 0.0,

                "total_dy": 0.0,

                "total_distance": 0.0,

                "movement_count": 0,

                "flow_direction": [
                    0.0,
                    0.0
                ],

                "flow_entropy": 0.0,

                "smoothed_density": 0.0,

                "smoothed_speed": 0.0,

                "density_change": 0.0,

                "speed_change": 0.0,

                "acceleration": 0.0,

                "bottleneck": False,

                "reverse_flow": False,

                "risk_score": 0,

                "risk_label": "NORMAL",

                "risk_reasons": []
            }


        # ====================================================
        # PROCESS PEOPLE
        # ====================================================

        # ====================================================
        # COUNT ALL DETECTIONS
        # ====================================================
        # Count every box YOLO found this frame, regardless of whether ByteTrack
        # has confirmed a persistent track ID for it yet. ByteTrack's internal
        # new_track_thresh (default 0.6) is higher than our YOLO conf=0.25, so
        # any detection scoring in between was being silently dropped from
        # result.boxes.id — and therefore never counted — even though YOLO
        # genuinely detected a person there. Density/count only need detections;
        # they don't need identity.
        all_boxes = result.boxes.xyxy.cpu().numpy() if result.boxes is not None else []
        for box in all_boxes:
            x1, y1, x2, y2 = box
            cx = int((x1 + x2) / 2)
            cy = int((y1 + y2) / 2)
            zone_id = get_zone(cx, cy, frame_width, frame_height)
            zone_data[zone_id]["people_count"] += 1
        # ====================================================
        # PROCESS TRACKED PEOPLE (movement / flow only)
        # ====================================================
        # Speed, flow direction, and flow entropy genuinely need a persistent
        # track ID (they compare a person's position across frames), so this
        # part still depends on result.boxes.id — unchanged in logic, just no
        # longer double-duty as the counting path. people_count is NOT
        # incremented here anymore; it's already been counted above.
        if result.boxes.id is not None:
            tracked_boxes = result.boxes.xyxy.cpu().numpy()
            track_ids = result.boxes.id.int().cpu().numpy()

            for box, track_id in zip(tracked_boxes, track_ids):
                x1, y1, x2, y2 = box
                cx = int((x1 + x2) / 2)
                cy = int((y1 + y2) / 2)
                zone_id = get_zone(cx, cy, frame_width, frame_height)

                zone_data[zone_id]["track_ids"].append(int(track_id))
                # =================================================
                # TRACK HISTORY
                # =================================================

                if track_id not in track_history:

                    track_history[
                        track_id
                    ] = []


                if len(
                    track_history[
                        track_id
                    ]
                ) > 0:

                    previous_position = (
                        track_history[
                            track_id
                        ][-1]
                    )

                    current_position = (
                        cx,
                        cy
                    )

                    (
                        dx,
                        dy,
                        distance
                    ) = calculate_movement(
                        previous_position,
                        current_position
                    )


                    if (
                        distance >=
                        MIN_MOVEMENT_PIXELS
                    ):

                        zone_data[
                            zone_id
                        ][
                            "total_dx"
                        ] += dx

                        zone_data[
                            zone_id
                        ][
                            "total_dy"
                        ] += dy

                        zone_data[
                            zone_id
                        ][
                            "total_distance"
                        ] += distance

                        zone_data[
                            zone_id
                        ][
                            "movement_count"
                        ] += 1


                        direction_bin = (
                            get_direction_bin(
                                dx,
                                dy
                            )
                        )

                        zone_flow_history[
                            zone_id
                        ].append(
                            direction_bin
                        )


                # =================================================
                # SAVE POSITION
                # =================================================

                track_history[
                    track_id
                ].append(
                    (cx, cy)
                )


                if len(
                    track_history[
                        track_id
                    ]
                ) > MAX_TRACK_HISTORY:

                    track_history[
                        track_id
                    ].pop(0)


        # ====================================================
        # CALCULATE FEATURES
        # ====================================================

        for zone_id in zone_data:

            data = zone_data[
                zone_id
            ]

            temporal = (
                zone_temporal_history[
                    zone_id
                ]
            )


            # ==================================================
            # DENSITY
            # ==================================================

            people_count = (
                data[
                    "people_count"
                ]
            )

            density = (
                people_count /
                MAX_PEOPLE_PER_ZONE
            )

            density = min(
                density,
                1.0
            )

            data[
                "density"
            ] = density


            # ==================================================
            # SPEED
            # ==================================================

            movement_count = (
                data[
                    "movement_count"
                ]
            )

            if movement_count > 0:

                avg_distance = (
                    data[
                        "total_distance"
                    ] /
                    movement_count
                )

                avg_speed = (
                    avg_distance *
                    fps
                )

            else:

                avg_speed = 0.0


            data[
                "avg_speed"
            ] = avg_speed


            # ==================================================
            # FLOW DIRECTION
            # ==================================================

            if movement_count > 0:

                avg_dx = (
                    data[
                        "total_dx"
                    ] /
                    movement_count
                )

                avg_dy = (
                    data[
                        "total_dy"
                    ] /
                    movement_count
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


            # ==================================================
            # ENTROPY
            # ==================================================

            data[
                "flow_entropy"
            ] = calculate_flow_entropy(
                zone_flow_history[
                    zone_id
                ]
            )


            # ==================================================
            # TEMPORAL HISTORY
            # ==================================================

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


            # ==================================================
            # SMOOTHED DENSITY
            # ==================================================

            smoothed_density = (
                moving_average(
                    temporal[
                        "density"
                    ]
                )
            )

            data[
                "smoothed_density"
            ] = smoothed_density

            temporal[
                "smoothed_density"
            ].append(
                smoothed_density
            )


            # ==================================================
            # SMOOTHED SPEED
            # ==================================================

            smoothed_speed = (
                moving_average(
                    temporal[
                        "speed"
                    ]
                )
            )

            data[
                "smoothed_speed"
            ] = smoothed_speed

            temporal[
                "smoothed_speed"
            ].append(
                smoothed_speed
            )


            # ==================================================
            # DENSITY CHANGE
            # ==================================================

            data[
                "density_change"
            ] = calculate_change(
                temporal[
                    "smoothed_density"
                ]
            )


            # ==================================================
            # SPEED CHANGE
            # ==================================================

            data[
                "speed_change"
            ] = calculate_change(
                temporal[
                    "smoothed_speed"
                ]
            )


            # ==================================================
            # ACCELERATION
            # ==================================================

            if movement_count > 0:

                acceleration = (
                    calculate_smoothed_acceleration(
                        temporal[
                            "smoothed_speed"
                        ]
                    )
                )

            else:

                acceleration = 0.0


            data[
                "acceleration"
            ] = acceleration

            temporal[
                "acceleration"
            ].append(
                acceleration
            )


            # ==================================================
            # BOTTLENECK
            # ==================================================

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


            # ==================================================
            # REVERSE FLOW
            # ==================================================

            reverse_flow_now = (
                detect_reverse_flow(
                    zone_flow_history[
                        zone_id
                    ]
                )
            )

            temporal[
                "reverse_flow"
            ].append(
                reverse_flow_now
            )

            data[
                "reverse_flow"
            ] = sustained_condition(
                temporal[
                    "reverse_flow"
                ]
            )


            # ==================================================
            # RISK
            # ==================================================

            (
                risk_score,
                risk_label,
                risk_reasons
            ) = calculate_risk_score(

                density=smoothed_density,

                density_change=(
                    data[
                        "density_change"
                    ]
                ),

                speed=smoothed_speed,

                entropy=(
                    data[
                        "flow_entropy"
                    ]
                ),

                bottleneck=(
                    data[
                        "bottleneck"
                    ]
                ),

                reverse_flow=(
                    data[
                        "reverse_flow"
                    ]
                )
            )


            data[
                "risk_score"
            ] = risk_score

            data[
                "risk_label"
            ] = risk_label

            data[
                "risk_reasons"
            ] = risk_reasons


        # ====================================================
        # TIMESTAMP
        # ====================================================

        timestamp = (
            datetime.now()
            .isoformat()
        )


        # ====================================================
        # SAVE ZONE FEATURES
        # ====================================================

        for zone_id, data in zone_data.items():

            flow_x = (
                data[
                    "flow_direction"
                ][0]
            )

            flow_y = (
                data[
                    "flow_direction"
                ][1]
            )


            zone_writer.writerow([

                timestamp,

                frame_number,

                zone_id,

                data[
                    "people_count"
                ],

                round(
                    data[
                        "smoothed_density"
                    ],
                    4
                ),

                round(
                    data[
                        "density_change"
                    ],
                    4
                ),

                round(
                    data[
                        "smoothed_speed"
                    ],
                    2
                ),

                round(
                    data[
                        "acceleration"
                    ],
                    2
                ),

                flow_x,

                flow_y,

                round(
                    data[
                        "flow_entropy"
                    ],
                    4
                ),

                data[
                    "bottleneck"
                ],

                data[
                    "reverse_flow"
                ],

                data[
                    "risk_score"
                ],

                data[
                    "risk_label"
                ]
            ])


        zone_csv.flush()


        # ====================================================
        # DETECT RISK EVENTS
        # ====================================================

        for zone_id, data in zone_data.items():

            current_risk = (
                data[
                    "risk_score"
                ]
            )

            old_risk = (
                previous_risk[
                    zone_id
                ]
            )


            # ------------------------------------------------
            # RISK CHANGED
            # ------------------------------------------------

            if current_risk != old_risk:

                record_risk_event(

                    zone_id=zone_id,

                    frame_number=frame_number,

                    timestamp=timestamp,

                    previous_score=old_risk,

                    new_score=current_risk,

                    data=data
                )


            # ------------------------------------------------
            # SAVE CURRENT STATE
            # ------------------------------------------------

            previous_risk[
                zone_id
            ] = current_risk


        # ====================================================
        # FIND OVERALL RISK
        # ====================================================

        highest_risk_zone = max(
            zone_data,
            key=lambda z:
            zone_data[z][
                "risk_score"
            ]
        )

        overall_risk_score = (
            zone_data[
                highest_risk_zone
            ][
                "risk_score"
            ]
        )

        overall_risk_label = (
            zone_data[
                highest_risk_zone
            ][
                "risk_label"
            ]
        )


        # ====================================================
        # DRAW YOLO
        # ====================================================

        annotated_frame = (
            result.plot()
        )


        # ====================================================
        # DRAW GRID
        # ====================================================

        annotated_frame = draw_grid(
            annotated_frame,
            frame_width,
            frame_height
        )


        # ====================================================
        # DRAW RISK PER ZONE
        # ====================================================

        zone_width = (
            frame_width /
            GRID_COLS
        )

        zone_height = (
            frame_height /
            GRID_ROWS
        )


        for zone_id, data in zone_data.items():

            zero_based = (
                zone_id - 1
            )

            row = (
                zero_based //
                GRID_COLS
            )

            col = (
                zero_based %
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


            risk_text = (
                f"R{data['risk_score']} "
                f"{data['risk_label']}"
            )

            cv2.putText(
                annotated_frame,
                risk_text,
                (x1 + 15, y1 + 65),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                (0, 255, 255),
                2
            )


            if data[
                "bottleneck"
            ]:

                cv2.putText(
                    annotated_frame,
                    "BOTTLENECK",
                    (x1 + 15, y1 + 90),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 0, 255),
                    2
                )


            if data[
                "reverse_flow"
            ]:

                cv2.putText(
                    annotated_frame,
                    "REVERSE FLOW",
                    (x1 + 15, y1 + 115),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 0, 255),
                    2
                )


        # ====================================================
        # OVERALL RISK
        # ====================================================

        cv2.rectangle(
            annotated_frame,
            (10, 10),
            (450, 60),
            (0, 0, 0),
            -1
        )

        cv2.putText(
            annotated_frame,
            (
                f"OVERALL: "
                f"R{overall_risk_score} "
                f"{overall_risk_label} "
                f"(Zone {highest_risk_zone})"
            ),
            (20, 45),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (255, 255, 255),
            2
        )


        # ====================================================
        # TERMINAL OUTPUT
        # ====================================================

        print(
            "\n" + "=" * 180
        )

        print(
            f"FRAME: {frame_number} | "
            f"OVERALL RISK: "
            f"{overall_risk_score} "
            f"{overall_risk_label} "
            f"| Highest Risk Zone: "
            f"{highest_risk_zone}"
        )

        print(
            "=" * 180
        )


        for zone_id, data in zone_data.items():

            print(
                f"Zone {zone_id:2d} | "
                f"People: "
                f"{data['people_count']:2d} | "
                f"Density: "
                f"{data['density']:.2f} | "
                f"SmoothD: "
                f"{data['smoothed_density']:.2f} | "
                f"Speed: "
                f"{data['smoothed_speed']:.1f} | "
                f"Entropy: "
                f"{data['flow_entropy']:.3f} | "
                f"Bottleneck: "
                f"{data['bottleneck']} | "
                f"ReverseFlow: "
                f"{data['reverse_flow']} | "
                f"RISK: "
                f"{data['risk_score']} "
                f"{data['risk_label']}"
            )


        # ====================================================
        # DISPLAY
        # ====================================================

        display_frame = cv2.resize(
            annotated_frame,
            (1280, 720)
        )

        cv2.imshow(
            "CrowdShield - Stage 12",
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


finally:

    # ========================================================
    # CLEANUP
    # ========================================================

    cap.release()

    cv2.destroyAllWindows()

    zone_csv.close()

    event_csv.close()


    print(
        "\n"
        + "=" * 70
    )

    print(
        "STAGE 12 COMPLETE"
    )

    print(
        f"Zone data: {ZONE_CSV_FILE}"
    )

    print(
        f"Risk events: {EVENT_CSV_FILE}"
    )

    print(
        f"Total frames: {frame_number}"
    )

    print(
        "=" * 70
    )