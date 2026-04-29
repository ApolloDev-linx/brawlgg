import { create } from "zustand";
import type { DraftState } from "@/types/meta";

interface DraftStore extends DraftState {
  addBan: (brawlerId: string) => void;
  addMyPick: (brawlerId: string) => void;
  addEnemyPick: (brawlerId: string) => void;
  reset: () => void;
}

const MAX_BANS = 6; // 3 per team, matching real ranked
const MAX_PICKS = 3;

const initialState: DraftState = {
  bans: [],
  myPicks: [],
  enemyPicks: [],
  currentPhase: "ban",
  currentTurn: "my",
};

export const useDraftStore = create<DraftStore>((set, get) => ({
  ...initialState,

  addBan: (brawlerId: string) => {
    const state = get();
    if (state.currentPhase !== "ban") return;
    if (state.bans.length >= MAX_BANS) return;
    if (state.bans.includes(brawlerId)) return;

    const newBans = [...state.bans, brawlerId];
    const switchPhase = newBans.length >= MAX_BANS;

    set({
      bans: newBans,
      currentPhase: switchPhase ? "pick" : "ban",
      currentTurn: switchPhase
        ? "my"
        : state.currentTurn === "my"
          ? "enemy"
          : "my",
    });
  },

  addMyPick: (brawlerId: string) => {
    const state = get();
    if (state.currentPhase !== "pick") return;
    if (state.currentTurn !== "my") return;
    if (state.myPicks.length >= MAX_PICKS) return;
    if (
      state.bans.includes(brawlerId) ||
      state.myPicks.includes(brawlerId) ||
      state.enemyPicks.includes(brawlerId)
    )
      return;

    set({
      myPicks: [...state.myPicks, brawlerId],
      currentTurn: "enemy",
    });
  },

  addEnemyPick: (brawlerId: string) => {
    const state = get();
    if (state.currentPhase !== "pick") return;
    if (state.currentTurn !== "enemy") return;
    if (state.enemyPicks.length >= MAX_PICKS) return;
    if (
      state.bans.includes(brawlerId) ||
      state.myPicks.includes(brawlerId) ||
      state.enemyPicks.includes(brawlerId)
    )
      return;

    set({
      enemyPicks: [...state.enemyPicks, brawlerId],
      currentTurn: "my",
    });
  },

  reset: () => set(initialState),
}));
