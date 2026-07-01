const DEVICE_KEY = "matsuri-master-device-id";
const WORKSPACE_KEY = "matsuri-master-workspace-id";

function generateId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function getOrCreateDeviceId() {
  if (typeof window === "undefined") return "device-server";
  const current = window.localStorage.getItem(DEVICE_KEY);
  if (current) return current;
  const next = generateId("device");
  window.localStorage.setItem(DEVICE_KEY, next);
  return next;
}

export function getOrCreateWorkspaceId() {
  if (typeof window === "undefined") return "workspace-local";
  const current = window.localStorage.getItem(WORKSPACE_KEY);
  if (current) return current;
  const next = generateId("workspace");
  window.localStorage.setItem(WORKSPACE_KEY, next);
  return next;
}

export function setWorkspaceId(value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKSPACE_KEY, value);
}
