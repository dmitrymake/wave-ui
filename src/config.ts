const isDev: boolean = import.meta.env.DEV;

interface Config {
  DEFAULT_IP: string;
  readonly MOODE_IP: string;
  setMoodeIp(ip: string): void;
}

export const CONFIG: Config = {
  DEFAULT_IP: isDev
    ? "192.168.1.100"
    : typeof window !== "undefined"
      ? window.location.hostname
      : "localhost",

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
      if (cleanIp) {
        localStorage.setItem("moode_ip", cleanIp);
      }
    }
  },
};
