import { HotelOptionSchema } from "../../dto.js";
import { span } from "../../observability.js";
import { runtime } from "../../runtime.js";
import type { TravelState } from "../state.js";

export async function hotelNode(state: TravelState): Promise<Partial<TravelState>> {
  const constraints = state.trip_constraints;
  const obs = span("node.hotel");
  try {
    const results = await runtime().tools.getHotels(
      constraints?.destination,
      constraints?.duration_days,
    );
    const hotels = results.map((o) => HotelOptionSchema.parse(o));
    return {
      hotel_results: hotels,
      messages: [{ role: "assistant", content: `Found ${hotels.length} hotel options.` }],
    };
  } finally {
    obs?.end();
  }
}
