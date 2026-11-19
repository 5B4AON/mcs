/**
 * Morse Code Studio
 */

/**
 * The connected MIDI port a mapping's saved device stands for (pure; shared by MIDI input and output).
 *
 * A browser may hand out a new port id when a USB interface is unplugged and plugged in again, so the id
 * saved in a mapping then matches nothing. When exactly one port is connected it is the one meant (the
 * same as "Any"); with several ports a missing id stays unmatched, because guessing could key the wrong
 * device. An empty `savedId` means any device and is not handled here.
 */
export function resolveMidiPort<T extends { id: string }>(savedId: string, ports: readonly T[]): T | null {
  return ports.find(p => p.id === savedId) ?? (ports.length === 1 ? ports[0] : null);
}
