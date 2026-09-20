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

## Continued search

Season 01 stays unchanged. `npm run prompts:search` resumes its prompts and recorded training samples in `.races/prompt-search`, tests the three remaining strategy priorities per driver, then compares the strongest proposed grid against the Season 01 selected grid in four paired races. Each training seed appears twice per grid, with run order reversed in the second pair. A candidate must finish at least 0.5% faster on average, win three of four pairs and add no unfinished races. An unchanged prompt cannot claim a promotion from a faster stochastic replay.

`npm run prompts:refine` starts only after that confirmation. Jev chooses untested local edits to pace, battery policy, lane choice and wording. Each sweep measures every available single-edit neighbor on both training circuits, retaining the full prompt and the editing decision. The best candidate grid then runs eight paired comparisons against the incumbent. Promotion requires seven wins, at least a 0.5% mean gain and no additional unfinished races. Two complete sweeps without a promotion trigger final comparisons on fresh seeds 18493 and 99251. These comparisons are not fed back into the search.

This stopping rule establishes the best confirmed prompts found in the tested neighborhood. It cannot prove optimality over all possible text prompts. Traffic couples the drivers, and request latency varies. Six refinement sweeps or 200,000 new requests pause at a review checkpoint; they never count as convergence. Broad screening has a separate 100,000-new-request checkpoint.

Both runners checkpoint completed races and preserve partial failures separately. Restarting uses the same directory and skips completed work. `npm run prompts:export` validates the saved recordings and publishes a snapshot to `public/prompt-search`. The prompt lab loads that snapshot while retaining the original championship table and archive. Snapshots show their status; the website does not claim a disconnected local process is still running in real time.

## Public replay archive

`/championship.html` groups completed recordings chronologically, ten per season. These seasons are viewing collections, not new scored championships. Every card retains its original session type. The original championship standings and prompt history remain at `/lab.html`.

Run `npm run archive:export` after recording new races. Export checks completed Jev recordings, saved decision logs and SHA-256 hashes before generating the card data. Circuit outlines come from each recording’s seed. Replays load the saved frames and answers without calling Jev again. Never substitute local demo races or staged incidents for missing recordings.
