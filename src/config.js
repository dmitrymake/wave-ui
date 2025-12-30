const isDev = import.meta.env.DEV;

export const CONFIG = {
  // ... other settings
  DEFAULT_IP: isDev
    ? "192.168.1.100"
    : typeof window !== "undefined"
      ? window.location.hostname
      : "localhost",

  get MOODE_IP() {
    try {
      // localStorage is NOT available in Workers
      if (typeof localStorage !== "undefined") {
        return localStorage.getItem("moode_ip") || this.DEFAULT_IP;
      }
      return this.DEFAULT_IP;
    } catch (e) {
      return this.DEFAULT_IP;
    }
  },
};
