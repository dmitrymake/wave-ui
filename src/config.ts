// SPDX-License-Identifier: MIT
// Copyright (c) 2025 dmitrymake
const isDev: boolean = import.meta.env.DEV;

interface Config {
  DEFAULT_IP: string;
  readonly MOODE_IP: string;
  readonly WS_PORT: string;
  setMoodeIp(ip: string): void;
}

export const CONFIG: Config = {
  DEFAULT_IP: isDev
    ? "192.168.1.100"
    : typeof window !== "undefined"
      ? window.location.hostname
      : "localhost",

  get WS_PORT(): string {
    return "8080";
  },

  get MOODE_IP(): string {
    try {
      if (typeof localStorage !== "undefined") {
        return localStorage.getItem("moode_ip") || this.DEFAULT_IP;
      }
      return this.DEFAULT_IP;
    } catch (e) {
      return this.DEFAULT_IP;
    }
  },

  setMoodeIp(ip: string): void {
    if (typeof localStorage !== "undefined") {
      const cleanIp: string = ip ? ip.trim() : "";
      // Accept hostname, IPv4, or bracketed IPv6 — reject control chars/spaces.
      if (cleanIp && /^[a-zA-Z0-9.\-_:[\]%]+$/.test(cleanIp) && !/[\s%\\]/.test(cleanIp)) {
        localStorage.setItem("moode_ip", cleanIp);
      }
    }
  },
};

/**
 * Single base-URL resolver. Replaces the three duplicated getBaseUrl() copies
 * (constants.ts, yandex.ts, api.ts) so dev/prod/:3000 logic cannot drift.
 */
export function resolveBaseUrl(): string {
  if (import.meta.env.DEV) return `http://${CONFIG.MOODE_IP}`;
  if (typeof window !== "undefined" && window.location.port === "3000") {
    return `http://${window.location.hostname}`;
  }
  return "";
}
