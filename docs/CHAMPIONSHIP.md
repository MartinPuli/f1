# Prompt lab and championship

The season searches driver prompts using real Jev responses. It does not fine-tune model weights or claim to find a globally optimal prompt.

Each driver starts with its existing prompt. After both training races, Jev receives that driver's results and chooses one untested strategy from five options: clean racing, attack, corner exits, battery management or passing. The runner appends the chosen priority to the original prompt. It repeats this once more, giving each driver three tested versions, including the baseline. The history saves the strategy choice, probabilities and exact prompt.

All versions race seeds 8912 and 2046 for two laps. Selection minimizes each driver's mean total finish time across those circuits. An unfinished race scores 1000 seconds plus the race duration. The lap chart shows the second lap, keeping the standing start out of the comparison; lap time is visible but is not the selection objective. A slower candidate remains in the history, and the original prompt can remain selected.

The baseline and the selected grid then race seed 73091, which was not used for selection. This single held-out comparison is a check, not proof of general improvement. Ten cars race together; changing other drivers' prompts changes traffic, and response latency varies. Driver physics attributes and starting positions also differ, so cross-driver rankings do not isolate prompt quality. The comparison within a driver keeps those attributes fixed.

Finally, the selected prompts run a three-race championship on seeds 66103, 91827 and 20260920. Finishers receive 25, 18, 15, 12, 10, 8, 6, 4, 2 and 1 points. Ties use counts of finishing positions, then driver ID for a stable display order. There is no fastest-lap bonus. Scripted incidents stay disabled throughout; contact and mechanical outcomes come from the simulation.

## Run or resume

```sh
npm run championship -- .races/championship
```

Supply a TypeSafe key through `TYPESAFE_API_KEY` or stdin. The runner never writes it to the history. For interactive use, disable terminal echo before pasting a key and restore it afterward; a password manager can also pipe the value to stdin. Never put a key in a command argument or commit it.

The runner requests an available versioned model when the API lists one; otherwise it uses the available alias and checks the resolved version in the responses. It reuses the production API validation and response parser, and allows one concurrent request per driver. It runs physics at 40 Hz in real time. Completed races checkpoint to disk; restarting the same output directory skips completed rounds. A failed race pauses the season and saves a partial recording separately, without awarding points. A 30,000-request ceiling bounds one season. This includes training and championship driving requests plus strategy-selection requests, not the model-list request.

Use a new output directory to start a fresh season. The runner refuses to continue if its requested model is unavailable or the resolved version changes. An existing history is required to resume; deleting it starts a new experiment.

## Publish the history

```sh
npm run championship:export -- .races/championship public/championship
npm run check
```

The exporter checks all eleven recordings, the selected prompts, standings and model identity before copying them. It rejects scripted incidents, failed decision requests and key-shaped values. The public JSON includes prompts and decisions, not credentials or request headers. The CSV provides one row per driver per race.

`/championship.html` displays standings, race replays, training lap times, prompt versions and the held-out comparison. Results in the race viewer links to it. The checked-in history is durable and public; it does not depend on browser storage or the ninety-day personal archive. New experiments remain local until exported and deployed.
