import { create } from "zustand";

interface ApiKeyModalStore {
  isOpen: boolean;
  ignoreSessionStorage: boolean;
  open: (ignoreSessionStorage?: boolean) => void;
  close: () => void;
}

export const useApiKeyModalStore = create<ApiKeyModalStore>((set) => ({
  isOpen: false,
  ignoreSessionStorage: false,
  open: (ignoreSessionStorage = false) =>
    set({ isOpen: true, ignoreSessionStorage }),
  close: () => set({ isOpen: false, ignoreSessionStorage: false }),
}));