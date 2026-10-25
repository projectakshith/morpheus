import dns from "node:dns/promises";
import net from "node:net";
import type { Engagement } from "./engagement";

const BLOCKED_ADDRESSES = (() => {
  const list = new net.BlockList();
  const ipv4: Array<[string, number]> = [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
    ["255.255.255.255", 32],
  ];
  const ipv6: Array<[string, number]> = [
    ["::", 96],
    ["::1", 128],
    ["64:ff9b::", 96],
    ["100::", 64],
    ["2001:2::", 48],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["fc00::", 7],
    ["fe80::", 10],
    ["fec0::", 10],
    ["ff00::", 8],
  ];
  for (const [network, prefix] of ipv4) list.addSubnet(network, prefix, "ipv4");
  for (const [network, prefix] of ipv6) list.addSubnet(network, prefix, "ipv6");
  return list;
})();

function mappedIpv4(address: string): string | null {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (dotted) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (!hex) return null;
  const high = Number.parseInt(hex[1], 16);
  const low = Number.parseInt(hex[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

export function isPrivateAddress(address: string): boolean {
  const mapped = mappedIpv4(address);
  if (mapped) return BLOCKED_ADDRESSES.check(mapped, "ipv4");
  if (net.isIP(address) === 4) return BLOCKED_ADDRESSES.check(address, "ipv4");
  if (net.isIP(address) === 6) return BLOCKED_ADDRESSES.check(address, "ipv6");
  return true;
}

export interface NetworkGuardDeps {
  resolveHost?: (host: string) => Promise<string[]>;
}

async function resolveHostAddresses(host: string, deps: NetworkGuardDeps): Promise<string[]> {
  if (deps.resolveHost) return deps.resolveHost(host);
  const records = await dns.lookup(host, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

export async function assertPublicResolution(
  hostname: string,
  engagement: Engagement,
  deps: NetworkGuardDeps = {}
): Promise<void> {
  if (engagement.allowPrivateTargets) return;
  const host = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) return;
  let addresses: string[];
  try {
    addresses = await resolveHostAddresses(host, deps);
  } catch {
    throw new Error(`Could not resolve ${host}; refusing to continue.`);
  }
  if (addresses.length === 0) throw new Error(`No addresses resolved for ${host}; refusing to continue.`);
  const blocked = addresses.find(isPrivateAddress);
  if (blocked) {
    throw new Error(`Target ${host} resolves to a private or link-local address (${blocked}). Re-arm with --allow-private if this is authorized.`);
  }
}
