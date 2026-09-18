# Jev driving defaults

The starter grid uses `jev-latest`. Connect TypeSafe to load the models available to your account. Under **Drivers**, select a car to edit its prompt and model; **Race rules** applies to all five. Names and numbers are editable. **Reset grid** restores the starter lineup.

Each active driver gets a separate request to `https://api.typesafe.ai/v1/systemone`. Its state contains five road samples up to 42 meters ahead, relative positions of nearby cars, speed, heading error, and its own eight recent observations. The backend bounds these fields, drops unknown data, and derives a brief road reading from the same samples. It never sends the seed, circuit map, or another driver's memory.

Following TypeSafe's guidance on [atomic questions](https://docs.typesafe.ai/introduction), each request asks two independent [Choice questions](https://docs.typesafe.ai/primitives/choice):

- `line`: center, left, or right side of the road. These are lane targets, not steering directions.
- `pace`: attack, balanced, cautious, or recover. Each driver prompt changes how it weighs traffic, bends, and passing opportunities.

Both questions receive the shared rules and that driver's prompt. The server validates both answers before returning a decision. It returns the lower of their confidence values, plus the resolved model version when supplied. These are JEVRACE's defaults; TypeSafe hasn't certified the prompts.

## What controls the car

Jev chooses targets every half-second of simulation time. A common controller follows them at 40 Hz using only local observations. It interpolates a point on the visible road, shifts it toward the selected lane, and steers toward it. Wheel movement has a rate limit. The speed controller leaves grip for course corrections and calculates braking distance from the visible bends and nearby traffic.

Recovery overrides the lane target when a car goes off track or points away from the road. It keeps the car rolling slowly and turns back toward the center. There is no teleport, hidden map, or switch to a demo driver. This assistance means the experiment compares model lane and pace choices; it doesn't measure direct control of steering and pedals.

The previous action set combined a fixed steering angle with acceleration or braking. Its tight-turn action could brake the car to a standstill, where steering couldn't turn it. Separating the targets lets the controller correct steering between model calls and maintain a low recovery speed.

Five drivers still cost up to five upstream calls per batch. Each call now contains two questions, which adds tokens. There is no application rate quota or artificial wall-clock delay between batches. The next batch starts when its simulation step is due and the previous one has completed. Provider rate responses still pause the race. Service errors pause the race; no local policy replaces missing Jev decisions.

## Testing

The automated tests use mocked TypeSafe responses and spend no credits. They check isolated prompts, response validation, local-only observations, cornering, recovery from the grass, and replay persistence. Physics tests cover constant and changing lane/pace targets across seeded circuits. These tests don't establish live model quality; that needs a connected TypeSafe account.
