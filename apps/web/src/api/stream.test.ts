import { describe, expect, it } from "vitest";
import type { StreamError, StreamMeta, StreamNode, StreamResult } from "./events";
import { parseSseFrame } from "./stream";

describe("parseSseFrame", () => {
  it("parses a meta frame", () => {
    const frame = 'event: meta\ndata: {"type":"meta","conversation_id":"abc","thread_id":"abc"}';
    const event = parseSseFrame(frame) as StreamMeta;
    expect(event.type).toBe("meta");
    expect(event.conversation_id).toBe("abc");
  });

  it("parses a node frame with selected_agents", () => {
    const frame =
      'event: node\ndata: {"type":"node","node":"supervisor","status":"completed","selected_agents":["flight","hotel"]}';
    const event = parseSseFrame(frame) as StreamNode;
    expect(event.node).toBe("supervisor");
    expect(event.selected_agents).toEqual(["flight", "hotel"]);
  });

  it("parses a terminal result frame carrying the plan", () => {
    const frame =
      'event: completed\ndata: {"type":"completed","plan":{"status":"completed","summary":"done"}}';
    const event = parseSseFrame(frame) as StreamResult;
    expect(event.type).toBe("completed");
    expect(event.plan.summary).toBe("done");
  });

  it("returns null for an empty / keep-alive frame", () => {
    expect(parseSseFrame("")).toBeNull();
    expect(parseSseFrame(": keep-alive")).toBeNull();
    expect(parseSseFrame("event: meta")).toBeNull();
  });

  it("ignores the event: line and reads type from data", () => {
    const frame = 'event: error\ndata: {"type":"error","message":"boom"}';
    const event = parseSseFrame(frame) as StreamError;
    expect(event.type).toBe("error");
    expect(event.message).toBe("boom");
  });
});
