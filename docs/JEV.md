# Jev driving defaults

The starter grid uses `jev-latest`, which the interface labels **Jev · Default**. Connecting a TypeSafe key loads the account's model catalog. The five driver identities and their numbers are editable; they don't give a model access to more of the track.

The integration follows TypeSafe's [Choice primitive](https://docs.typesafe.ai/primitives/choice) and [HTTP quick start](https://docs.typesafe.ai/introduction/quickstart). Each active driver receives its own request with `state`, `model`, and a `questions.drive` entry. That entry has `type: "choice"`, instructions, and a map of allowed actions. `server/api.js` accepts only a known `answers.drive.choice`; TypeSafe also returns confidence and may return the resolved model version.

The default question asks which action keeps the car on the visible road while making forward progress over the next half-second. Five road samples, relative car positions, speed, heading error, and eight recent observations form the state. The backend drops unknown fields and bounds every numeric input. It never supplies the circuit seed or full geometry.

There are eleven actions: accelerate, coast, or brake with left, straight, or right steering, plus a tight left or right turn. Each description states its steering and braking behavior. Shared instructions define the coordinate system and physics; the race prompt sets the objective, and each driver's prompt adjusts risk and overtaking preferences. These are JEVRACE defaults, not prompts supplied or certified by TypeSafe.

Open **New race → Grid** to change a name or number. **Jev settings** contains the model, driver prompt, and shared race prompt. **Reset grid** restores the complete starter configuration. Demo mode ignores model prompts and runs a local driving policy; Results hides its unused Jev configuration.

Tests mock TypeSafe so development doesn't spend a visitor's credits. A real key and account are still required to check live inference quality; default prompts don't guarantee that every driver will finish.
