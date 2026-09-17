import { WeatherInfoSchema } from "../../dto.js";
import { span } from "../../observability.js";
import { runtime } from "../../runtime.js";
import type { TravelState } from "../state.js";

export async function weatherNode(state: TravelState): Promise<Partial<TravelState>> {
  const constraints = state.trip_constraints;
  const obs = span("node.weather");
  try {
    const info = WeatherInfoSchema.parse(
      await runtime().tools.getWeather(constraints?.destination, constraints?.duration_days),
    );
    return {
      weather_info: info,
      messages: [{ role: "assistant", content: `Weather gathered for ${info.destination}.` }],
    };
  } finally {
    obs?.end();
  }
}
