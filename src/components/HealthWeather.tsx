import { CloudRainWind, CloudLightning, Cloud, CloudSun, SunMedium } from "lucide-react";

// Profit factor as weather, worst to best; `tier` (1-5) comes from healthTierFromProfitFactor.
const WEATHER = [
  { Icon: CloudRainWind, title: "PF < 0.5", tone: "text-stone-900" },
  { Icon: CloudLightning, title: "PF 0.5 - 0.79", tone: "text-stone-700" },
  { Icon: Cloud, title: "PF 0.8 - 1.19", tone: "text-stone-500" },
  { Icon: CloudSun, title: "PF 1.2 - 1.99", tone: "text-orange-300" },
  { Icon: SunMedium, title: "PF >= 2.0", tone: "text-orange-400" },
];

// For a page's title line: all five with the current one large on a computer, only the current one on a phone.
export default function HealthWeather({ tier }: { tier: number }) {
  return (
    <div className="flex items-center justify-center md:gap-1 h-9 shrink-0">
      {WEATHER.map(({ Icon, title, tone }, i) => {
        const isCurrent = tier === i + 1;
        return (
          <div key={title} title={title} className={`${isCurrent ? 'flex' : 'hidden md:flex'} items-center justify-center w-9 h-9 md:w-10 md:h-10 cursor-help`}>
            <Icon className={`transition-all duration-500 hover:scale-110 ${isCurrent ? `w-8 h-8 md:w-10 md:h-10 ${tone} drop-shadow-md` : 'w-4 h-4 text-stone-400'}`} />
          </div>
        );
      })}
    </div>
  );
}
