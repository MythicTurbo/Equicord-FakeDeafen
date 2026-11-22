# FakeDeafen (Equicord / Vencord plugin)

Look deafened or muted to everyone else in a voice call while you can still hear everything.

## Features

- **Fake Deafen** and **Fake Mute** switches in the voice popout (the little arrow next to the deafen button)
- Your own row in the voice channel list **and** your own tile in the call view show the state, only on your screen:
  - **blue** icon = fake (others see it, you don't actually have it)
  - **red** icon = real
- **Click a blue icon** (in the list or on your call tile) to turn it into the real thing (it goes red). Click a red icon to turn it off
- If you press the real deafen or mute button, the matching fake switches itself off
- **Keep my microphone muted** setting (on by default): while you fake deafen, your mic is really muted so you can only listen. Unmuting ends the fake deafen. Fake Mute is locked while this is on, since your mic is already really muted. Turn the setting off if you want to keep talking while you look deafened
- Your mic is given back when you stop, even if Discord was restarted in between

## How it works

Discord tells the server your voice state with a gateway message (opcode 4). The plugin changes that outgoing message so `self_deaf` / `self_mute` are `true` while a fake is on. Your local audio is never touched, which is why you keep hearing. Everyone else just sees the icon the server gives them.

## Install

Custom plugins only work in a **source build** of Equicord or Vencord (not the normal installer version).

1. Set up a source build if you don't have one:
   - Equicord: https://github.com/Equicord/Equicord
   - Vencord: https://docs.vencord.dev/installing/
2. Copy this plugin into the userplugins folder so you have:
   ```
   src/userplugins/fakeDeafen/index.tsx
   ```
   For example, from the root of your Equicord/Vencord folder:
   ```
   git clone https://github.com/MythicTurbo/Equicord-FakeDeafen src/userplugins/fakeDeafen
   ```
3. Build and inject:
   ```
   pnpm build
   pnpm inject
   ```
4. Restart Discord (or press Ctrl+R).
5. Open **Settings > Plugins**, search **FakeDeafen** and turn it on.

## Usage

1. Join a voice channel.
2. Click the small arrow next to the deafen (headphones) button.
3. Tick **Fake Deafen** and/or **Fake Mute**.
4. Check your name in the voice channel list: blue icons mean the fake is on.
5. To stop: untick the switch, click a red icon or press your real deafen/mute.

The switches are greyed out when you're not in a voice channel.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Keep my microphone muted | On | Really mutes your mic while you fake deafen, so you can't talk. Unmuting ends the fake deafen |

## Notes

- Client mods break Discord's Terms of Service. Use at your own risk.
- Discord updates can rename the internal code this plugin patches. If the icons stop showing, the fake switches will usually still work. Open an issue.
- Based on ideas from [hyyven/Vencord-FakeDeafen](https://github.com/hyyven/Vencord-FakeDeafen) and [BlockTol/Discord-Fake-Deafen](https://github.com/BlockTol/Discord-Fake-Deafen).
