# JEVRACE colour and spacing

The UI takes its cues from painted race cars and pit equipment. Neutral panels sit over darker tarmac and muted grass. Driver numbers use solid paint colours; names and numbers carry identity as well as colour.

| Role         | Colour    | Use                       |
| ------------ | --------- | ------------------------- |
| Paint white  | `#f5f5ef` | Panels and dialogs        |
| Graphite     | `#252b28` | Body text and headings    |
| Utility grey | `#606b65` | Secondary labels          |
| Logo orange  | `#bc4436` | Controls and request line |
| Ochre        | `#d38c37` | Received replies          |
| Racing red   | `#d24732` | Kerbs and track accents   |

Neutral scale, from 50 to 950: `#f5f5ef`, `#eceee8`, `#d6dcd4`, `#bcc5bc`, `#929f93`, `#748176`, `#606b65`, `#48534b`, `#333d35`, `#252b28`, `#151c17`.

Warning uses `#795322` on `#f6e9cc`; healthy state uses `#455f35` on `#e7ece2`. Messages name the condition. The request series is a line and replies are bars, so their shapes remain distinct without colour.

Measured contrast on paint white: graphite 13.19:1 and secondary text 5.07:1. Control accents match the orange in the logo. Number plates choose dark or white text from the paint’s relative luminance. Probability labels sit above the bar fill.

A future dark theme can map panel/text/secondary/control to `#252b28`, `#f5f5ef`, `#bcc5bc`, `#eea393`; the app currently ships the light theme only.

The timing panel is 236 px wide with an 8 px inset and 34 px rows. All ten drivers remain visible. The Jev panel is a single vertical column, 280 px wide, with 14 × 16 px padding. It shows probabilities, model information, observations, response history and API activity without an expansion step. Only the raw JSON is collapsed. Mobile uses narrower side-by-side panels and keeps replay controls below them.

References: [McLaren’s papaya racing colours](https://www.mclaren.com/racing/heritage/the-story-of-the-marque/) and [Porsche’s Brumos liveries](https://newsroom.porsche.com/en_US/motorsport/porsche-gt-team-retro-colors-daytona-sebring-2019-18340.html). The palette is original to this app; it does not reproduce a team livery.
