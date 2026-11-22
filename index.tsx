/*
 * Fake Deafen + Fake Mute
 *
 * - "Fake Deafen" / "Fake Mute" switches in the voice device popout (the ˄ menu
 *   above the mic / deafen buttons).
 * - Settings: "Keep my microphone muted" — while fake-deafened, also really mute
 *   your mic so you can't talk (you can only hear). Unmuting ends the fake.
 *
 * Mechanism: wraps the gateway socket's send(). Voice-state updates go out as
 * gateway op 4. While a fake flag is on, we force self_deaf / self_mute to true
 * on that outgoing payload, so others see you deafened/muted while your real
 * local audio is untouched (you keep hearing).
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { findByProps, findByPropsLazy } from "@webpack";
import { Menu, React } from "@webpack/common";

const MediaEngineActions = findByPropsLazy("toggleSelfMute");

const settings = definePluginSettings({
    keepMicMuted: {
        type: OptionType.BOOLEAN,
        description: "Keep my microphone muted. While you look deafened you can't talk (you only hear), and unmuting ends it. Fake Mute is locked while this is on. Turn this off to keep your mic working while fake-deafened.",
        default: true,
    },
    fakeDeafen: {
        type: OptionType.BOOLEAN,
        description: "Fake Deafen",
        default: false,
        hidden: true,
    },
    fakeMute: {
        type: OptionType.BOOLEAN,
        description: "Fake Mute",
        default: false,
        hidden: true,
    },
});

let originalSend: ((op: number, data: any, ...args: any[]) => any) | undefined;
let mediaStore: any;
let prevDeaf = false;
let prevMute = false;
let autoMuted = false; // did WE real-mute the mic for keepMicMuted?
let unmuteOnUndeafen = false; // fake -> real deafen while auto-muted: give the mic back on undeafen

function getSocket() {
    try {
        return findByProps("getSocket")?.getSocket?.();
    } catch {
        return undefined;
    }
}

function isInVoiceChannel(): boolean {
    try {
        return !!findByProps("getVoiceChannelId")?.getVoiceChannelId();
    } catch {
        return false;
    }
}

function isReallyMuted(): boolean {
    try {
        return !!mediaStore?.isMute?.();
    } catch {
        return false;
    }
}

// Set real mic mute to a specific state (MediaEngine only exposes a toggle).
function setRealMute(target: boolean) {
    try {
        if (isReallyMuted() !== target) MediaEngineActions.toggleSelfMute();
    } catch (e) {
        console.error("[FakeDeafen] setRealMute failed:", e);
    }
}

// Push a fresh voice-state so a toggle takes effect immediately.
function refreshVoiceState() {
    try {
        const ChannelStore = findByProps("getChannel", "getDMFromUserId");
        const SelectedChannelStore = findByProps("getVoiceChannelId");
        const socket = getSocket();

        const channelId = SelectedChannelStore?.getVoiceChannelId();
        if (!socket || !channelId) return;

        const channel = ChannelStore?.getChannel(channelId);

        socket.send(4, {
            guild_id: channel?.guild_id ?? null,
            channel_id: channelId,
            self_mute: settings.store.fakeMute || (mediaStore?.isMute?.() ?? false),
            self_deaf: settings.store.fakeDeafen || (mediaStore?.isDeaf?.() ?? false),
            self_video: false,
            flags: 0
        });
    } catch (e) {
        console.error("[FakeDeafen] refreshVoiceState failed:", e);
    }
}

function toggleFakeDeafen() {
    settings.store.fakeDeafen = !settings.store.fakeDeafen;

    if (settings.store.fakeDeafen) {
        // turning fake deafen ON: the real mute replaces any fake mute
        if (settings.store.keepMicMuted) settings.store.fakeMute = false;
        if (settings.store.keepMicMuted && !isReallyMuted()) {
            setRealMute(true);
            autoMuted = true;
        }
    } else {
        // turning fake deafen OFF — undo our auto-mute
        if (autoMuted) {
            setRealMute(false);
            autoMuted = false;
        }
    }

    refreshVoiceState();
}

// Fake Mute is pointless while fake deafen is really muting your mic.
function fakeMuteLocked(): boolean {
    return settings.store.fakeDeafen && settings.store.keepMicMuted;
}

function toggleFakeMute() {
    if (fakeMuteLocked()) return;
    settings.store.fakeMute = !settings.store.fakeMute;
    refreshVoiceState();
}

// React to the user's REAL deafen/mute button.
function onMediaChange() {
    try {
        const d = !!mediaStore?.isDeaf?.();
        const m = !!mediaStore?.isMute?.();

        // Actually deafening/muting for real turns off the matching fake.
        if (d && !prevDeaf && settings.store.fakeDeafen) {
            settings.store.fakeDeafen = false;
            if (autoMuted) unmuteOnUndeafen = true;
            autoMuted = false;
            refreshVoiceState();
        }

        // Undeafening after a fake -> real switch: undo the mute we added.
        if (!d && prevDeaf && unmuteOnUndeafen) {
            unmuteOnUndeafen = false;
            prevDeaf = d;
            prevMute = m;
            setRealMute(false);
            return;
        }
        if (m && !prevMute && settings.store.fakeMute) {
            settings.store.fakeMute = false;
            refreshVoiceState();
        }

        // keepMicMuted: manually unmuting ends fake deafen.
        if (!m && prevMute && settings.store.fakeDeafen && settings.store.keepMicMuted) {
            settings.store.fakeDeafen = false;
            autoMuted = false;
            refreshVoiceState();
        }

        prevDeaf = d;
        prevMute = m;
    } catch (e) {
        console.error("[FakeDeafen] onMediaChange failed:", e);
    }
}

// ---- your own row in the voice channel list --------------------------------
// Discord's ConnectedVoiceUser reads YOUR deafen/mute from local audio state,
// so a fake never shows an icon. We patch it to also show the fake ones, and tag
// your row with classes so CSS can color: fake = blue, real = red.

const FAKE_COLOR = "#3b9dff";
const REAL_COLOR = "#f23f43";
// path data that identifies Discord's deafen / mute icons
const DEAF_PATH = 'path[d^="M22.7 2.7"]';
const MUTE_PATH = 'path[d^="m2.7 22.7"]';

const CSS = `
.vc-fd-self svg:has(${DEAF_PATH}), .vc-fd-self svg:has(${MUTE_PATH}) { color: ${REAL_COLOR} !important; cursor: pointer; }
.vc-fd-self.vc-fd-deaf svg:has(${DEAF_PATH}) { color: ${FAKE_COLOR} !important; }
.vc-fd-self.vc-fd-mute svg:has(${MUTE_PATH}) { color: ${FAKE_COLOR} !important; }
`;

let styleEl: HTMLStyleElement | undefined;

// Clicking an icon on your own row: blue (fake) -> real (red); red (real) -> off.
function onIconClick(e: MouseEvent) {
    const target = e.target as Element | null;
    const row = target?.closest?.(".vc-fd-self");
    if (!row) return;
    const svg = target!.closest("svg");
    if (!svg) return;

    const isDeafIcon = !!svg.querySelector(DEAF_PATH);
    const isMuteIcon = !!svg.querySelector(MUTE_PATH);
    if (!isDeafIcon && !isMuteIcon) return;

    e.preventDefault();
    e.stopPropagation();

    try {
        if (isDeafIcon) {
            // fake -> real: real deafen also clears the fake (see onMediaChange)
            MediaEngineActions.toggleSelfDeaf();
        } else {
            MediaEngineActions.toggleSelfMute();
        }
    } catch (err) {
        console.error("[FakeDeafen] icon click failed:", err);
    }
}

export default definePlugin({
    name: "FakeDeafen",
    description: "Appear deafened and/or muted to others while you still hear. Optionally keep your mic really muted so you can't talk while fake-deafened.",
    authors: [{ name: "MythicTurbo", id: 0n }],
    settings,

    contextMenus: {
        "audio-device-context"(children) {
            children.push(
                <Menu.MenuSeparator />,
                <Menu.MenuCheckboxItem
                    id="vc-fake-deafen"
                    label="Fake Deafen"
                    checked={settings.store.fakeDeafen}
                    disabled={!isInVoiceChannel()}
                    action={toggleFakeDeafen}
                />,
                <Menu.MenuCheckboxItem
                    id="vc-fake-mute"
                    label="Fake Mute"
                    checked={settings.store.fakeMute}
                    disabled={!isInVoiceChannel() || fakeMuteLocked()}
                    action={toggleFakeMute}
                />
            );
        }
    },

    patches: [
        {
            find: 'location:"ConnectedVoiceUser"',
            replacement: {
                // isSelf is the last thing set before these; spread our extra props after it
                match: /isSelf:(\i),application:/,
                replace: "isSelf:$1,...$self.selfRowProps($1),application:"
            }
        },
        {
            // middle component only forwards a fixed prop list; add our className to it
            find: "VOICE_USER],shouldShow",
            replacement: {
                match: /(\i)=\{user:(\i),speaking:/,
                replace: "$1={className:$self.rowClass(arguments[0]),user:$2,speaking:"
            }
        }
    ],

    rowClass(props: any) {
        return props?.className;
    },

    // Called during the row's render. Returns extra props for YOUR row only.
    selfRowProps(isSelf: boolean) {
        const { fakeDeafen, fakeMute } = settings.use(["fakeDeafen", "fakeMute"]);
        if (!isSelf) return {};

        const extra: Record<string, any> = {
            // mute icon is only blue when the mic is actually live; a real mute stays red
            className: "vc-fd-self" + (fakeDeafen ? " vc-fd-deaf" : "") + (fakeMute && !isReallyMuted() ? " vc-fd-mute" : "")
        };
        if (fakeDeafen) extra.deaf = true;
        if (fakeMute) extra.mute = true;
        return extra;
    },

    start() {
        styleEl = document.createElement("style");
        styleEl.id = "vc-fakedeafen-style";
        styleEl.textContent = CSS;
        document.head.appendChild(styleEl);
        document.addEventListener("click", onIconClick, true);

        mediaStore = findByProps("isDeaf", "isMute");
        if (fakeMuteLocked()) settings.store.fakeMute = false; // clear stale state

        const socket = getSocket();
        if (!socket) {
            console.error("[FakeDeafen] gateway socket not found");
        } else {
            originalSend = socket.send;
            const orig = originalSend;
            socket.send = function (op: number, data: any, ...args: any[]) {
                // op 4 = voiceStateUpdate
                if (op === 4 && data) {
                    if (settings.store.fakeDeafen) data.self_deaf = true;
                    if (settings.store.fakeMute) data.self_mute = true;
                }
                return orig!.apply(this, [op, data, ...args]);
            };
        }

        if (mediaStore?.addChangeListener) {
            prevDeaf = !!mediaStore.isDeaf?.();
            prevMute = !!mediaStore.isMute?.();
            mediaStore.addChangeListener(onMediaChange);
        }
    },

    stop() {
        const socket = getSocket();
        if (socket && originalSend) socket.send = originalSend;
        originalSend = undefined;

        if (mediaStore?.removeChangeListener) mediaStore.removeChangeListener(onMediaChange);

        styleEl?.remove();
        styleEl = undefined;
        document.removeEventListener("click", onIconClick, true);
    }
});
