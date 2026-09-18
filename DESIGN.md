# JEV Prix — pit board system

The racing scene is the main surface. Interface chrome should read like lightweight timing equipment, not a promotional game menu. The single visual signature is the real circuit silhouette; every other element is a control or race datum.

## Tokens

- Paper: #f8fafb — modal and control surfaces.
- Panel: #edf2f5 — circuit inset and grouped controls.
- Ink: #24364b — primary text.
- Muted: #63748a — secondary data.
- Team blue: #315f96 — one primary action and selected states.
- Rule: #dbe3eb — field borders and separators.

Driver liveries and the existing 3D world retain their own colors. Interface shadows derive from Ink with low opacity. Corners: 6 px controls, 12 px dialogs. Spacing: 4 / 8 / 12 / 16 / 24 / 32 px.

Type: Barlow regular for text, medium for labels, semibold for actions; Barlow Condensed semibold for the wordmark and racing numerals; system monospace for times and seeds. No rounded display lettering, text strokes or decorative uppercase slogans.

## Layout

The setup dialog uses a compact vertical arrangement, with the circuit preview doing the framing instead of a headline and explanatory paragraph.

```
New race                         ×
┌────────────────────────────────┐
│       circuit silhouette       │
│ 348 m        Seed [42]    ⤨     │
└────────────────────────────────┘
Name [Sunshine Grand Prix       ]
Drivers [Demo | Jev]    Laps [3 ]
[             Start race        ]
```

Results use one table and one replay action. Saved races use compact rows. API text appears only where a user chooses paid Jev mode or edits a key. Errors remain actionable. Autosave has a short status; manual retry appears only on failure.

## Critique before implementation

The previous cream/terracotta palette, thick rounded font, repeated slogans and separate rounded cards all competed with the circuit. Remove them. Avoid replacing them with a dark esports template: use cool timing-screen surfaces, livery colors only where they identify a driver, and one restrained blue action. No new feature or onboarding layer is needed.
