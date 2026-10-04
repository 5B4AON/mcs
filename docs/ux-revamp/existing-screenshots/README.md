This folder contains seven screenshots from the Samsung Galaxy S21 in portrait mode. They are in no particular order and show several existing app surfaces, including overlaid settings/control UI and floating keyer/keyboard controls.

Each JPEG is 738 × 1599 image pixels. This is the raster size of the captured files, not the app's CSS viewport size: Android status/navigation bars, browser chrome, display density, and zoom affect the available web content area. Do not calculate CSS breakpoints or control dimensions directly from these pixel values.

Use the screenshots as the human-tested mobile reference for available real estate and relative sizing. Future UI work may reorganize content, but must preserve the relative font, button/icon, touch-target, and spacing scale shown here. Do not shrink existing controls or text to squeeze in new functionality; prefer progressive disclosure, vertical flow/scroll, or existing modal/menu patterns. The owner must manually compare affected screens against these images on the actual device and approve any proposed change to this tested scale.

For precise, source-checked CSS sizes, breakpoint edges, viewport test matrix, and the distinction between raster pixels and CSS viewport pixels, use the [numeric UI constraint framework in the roadmap](../00-ROADMAP-AND-IMPLEMENTATION-GUARDRAILS.md#numeric-ui-constraint-framework). That framework records the current code values so future agents need not inspect these images to recover the layout rules.

The screenshots focus on mobile because that is where screen-space constraints are greatest. Desktop remains responsive and should reflow to use available space without clipping, hiding existing top-bar controls, or becoming visually unbalanced.
