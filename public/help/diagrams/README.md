Place generated SVG files here.

Each .mmd (Mermaid) source file in src/app/help/diagrams/ has a
corresponding .svg that should be generated and placed in this folder.

Files expected:
  pilot-tone-wiring.svg
  cw-audio-input.svg
  opto-dc-mode.svg
  opto-ac-bridge.svg
  serial-port-output.svg
  single-soundcard.svg
  dual-soundcard.svg

To generate, use the Mermaid CLI, VS Code Mermaid Preview, or any renderer:
  npx -p @mermaid-js/mermaid-cli mmdc -i src/app/help/diagrams/FILE.mmd -o public/help/diagrams/FILE.svg
