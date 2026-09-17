import { FlightOptionSchema } from "../../dto.js";
import { span } from "../../observability.js";
import { runtime } from "../../runtime.js";
import type { TravelState } from "../state.js";

export async function flightNode(state: TravelState): Promise<Partial<TravelState>> {
  const constraints = state.trip_constraints;
  const obs = span("node.flight");
  try {
    const results = await runtime().tools.getFlights(constraints?.origin, constraints?.destination);
    const flights = results.map((o) => FlightOptionSchema.parse(o));
    return {
      flight_results: flights,
      messages: [{ role: "assistant", content: `Found ${flights.length} flight options.` }],
    };
  } finally {
    obs?.end();
  }
}
