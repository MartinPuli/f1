# Jev driving defaults

The starter grid uses `jev-latest`. Connect TypeSafe to load the models available to your account. Under **Drivers**, select a car to edit its prompt and model; **Race rules** applies to all ten. Names and numbers are editable. **Reset grid** restores the starter lineup.

Each active driver gets a separate request to `https://api.typesafe.ai/v1/systemone`. Its state contains five road samples up to 42 meters ahead, relative positions of nearby cars, speed, heading error, battery, tire grip, damage, race position, laps remaining, and its own eight recent observations. The road reading includes lane occupancy, closing speeds and slipstream strength. The backend bounds these fields, drops unknown data, and derives a brief road reading from the same samples. It never sends the seed, circuit map, or another driver's memory.

Following TypeSafe's guidance on [atomic questions](https://docs.typesafe.ai/introduction), each request asks three independent [Choice questions](https://docs.typesafe.ai/primitives/choice):

- `line`: center, left, or right side of the road. These are lane targets, not steering directions.
- `pace`: attack, balanced, cautious, or recover. Each driver prompt changes how it weighs traffic, bends, and passing opportunities.
- `power`: deploy, neutral, or harvest. Battery charge limits the boost; harvesting trades acceleration for charge.

All questions receive the shared rules and that driver's prompt. The server validates all answers before returning a decision. It returns the lowest of their confidence values, plus the resolved model version when supplied. These are JEVRACE's defaults; TypeSafe hasn't certified the prompts.

## What controls the car

Each driver sends a fresh observation on the next physics step after its previous response. Requests run independently, with at most one in flight per driver. There is no half-second timer or wait for the slowest driver. The grid only requests one opening decision per car. Cars continue on the previous answer while a request runs. A common controller follows them at 40 Hz using only local observations. It interpolates a point on the visible road, shifts it toward the selected lane, and steers toward it. Each driver takes 160–300 ms of simulation time to react to a new answer. Pedals and steering ramp toward their targets. The five red lights illuminate one per second, hold for a seeded interval, then go out together; each driver waits for its own reaction time before launching. Acceleration and braking share available tire grip with cornering. The speed controller leaves grip for course corrections and calculates braking distance from the visible bends and nearby traffic.

Recovery overrides the lane target when a car goes off track or points away from the road. It keeps the car rolling slowly and turns back toward the center. There is no teleport, hidden map, or switch to a demo driver. This assistance means the experiment compares model lane and pace choices; it doesn't measure direct control of steering and pedals.

The defaults give every driver a separate plan: early attacks, corner exits, defense, battery saving, slipstream passes, or a final-lap push. These are preferences in the model prompt, not scripts that force a finishing order.

`src/physics.js` models oriented car bodies, low-restitution impulses, lateral sliding, impact damage, tire wear, battery deployment and recovery. A following car gets less drag in the slipstream. Damage reduces engine output and grip. The dimensions match the rendered cars; the forces and wear rates suit short races. This is a simplified open-wheel simulation, not an exact F1 vehicle or sporting-regulation model; it has no pit stops, tire compounds, flags or penalties.

Each driver request contains three questions. Ten active drivers can have ten concurrent upstream calls. API latency determines the frequency, so faster replies increase consumption. Pausing stops new requests; already-sent calls may still complete. Provider rate responses and service errors pause the race; no local policy replaces missing Jev decisions.

## Testing

The automated tests use mocked TypeSafe responses and spend no credits. They check isolated prompts, response validation, local-only observations, cornering, recovery from the grass, and replay persistence. Physics tests cover constant and changing lane/pace targets across seeded circuits. These tests don't establish live model quality; that needs a connected TypeSafe account.
