export interface WeatherInfo {
  date: string;
  maxTemp: number;
  minTemp: number;
  code: number;
  isForecast: boolean;
  isExtreme: boolean;
}

// Map WMO Weather Codes to Emojis and descriptions
export const getWeatherMeta = (code: number) => {
  // WMO Weather interpretation codes (WW)
  // 0: Clear sky
  // 1, 2, 3: Mainly clear, partly cloudy, and overcast
  // 45, 48: Fog and depositing rime fog
  // 51, 53, 55: Drizzle: Light, moderate, and dense intensity
  // 56, 57: Freezing Drizzle: Light and dense intensity
  // 61, 63, 65: Rain: Slight, moderate and heavy intensity
  // 66, 67: Freezing Rain: Light and heavy intensity
  // 71, 73, 75: Snow fall: Slight, moderate, and heavy intensity
  // 77: Snow grains
  // 80, 81, 82: Rain showers: Slight, moderate, and violent
  // 85, 86: Snow showers slight and heavy
  // 95: Thunderstorm: Slight or moderate
  // 96, 99: Thunderstorm with slight and heavy hail
  
  let emoji = '🌤️';
  let desc = 'בהיר / מעונן חלקית';
  let bgClass = 'from-blue-100 to-amber-50 dark:from-blue-900/40 dark:to-amber-900/20';

  if (code === 0) {
    emoji = '☀️'; desc = 'בהיר שטוף שמש'; bgClass = 'from-amber-100 to-orange-50 dark:from-amber-900/40 dark:to-orange-900/20';
  } else if ([1, 2, 3].includes(code)) {
    emoji = '⛅'; desc = 'מעונן חלקית עד מעונן'; bgClass = 'from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700';
  } else if ([45, 48].includes(code)) {
    emoji = '🌫️'; desc = 'ערפל'; bgClass = 'from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600';
  } else if ([51, 53, 55, 56, 57].includes(code)) {
    emoji = '🌧️'; desc = 'טפטוף / גשם קל'; bgClass = 'from-blue-100 to-slate-200 dark:from-blue-900/30 dark:to-slate-800';
  } else if ([61, 63, 65, 80, 81, 82].includes(code)) {
    emoji = '☔'; desc = 'גשום'; bgClass = 'from-blue-200 to-slate-300 dark:from-blue-800/40 dark:to-slate-700';
  } else if ([66, 67, 71, 73, 75, 77, 85, 86].includes(code)) {
    emoji = '❄️'; desc = 'שלג / ברד'; bgClass = 'from-sky-100 to-white dark:from-sky-900/40 dark:to-slate-800';
  } else if ([95, 96, 99].includes(code)) {
    emoji = '⛈️'; desc = 'סופות רעמים'; bgClass = 'from-slate-300 to-slate-500 dark:from-slate-700 dark:to-slate-900';
  }

  return { emoji, desc, bgClass };
};

export const getTripWeather = async (
  destinations: string[], 
  startDate: string, 
  endDate: string
): Promise<Record<string, WeatherInfo>> => {
  if (!destinations || destinations.length === 0) return {};

  const targetDest = destinations[0]; // Fetch for the first destination
  
  try {
    // 1. Geocode Destination
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(targetDest)}&count=1&language=en&format=json`);
    const geoData = await geoRes.json();
    
    if (!geoData.results || geoData.results.length === 0) {
      return {};
    }

    const { latitude, longitude } = geoData.results[0];

    // 2. Fetch 16 days forecast
    const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=16`);
    const weatherData = await weatherRes.json();

    if (!weatherData.daily || !weatherData.daily.time) {
      return {};
    }

    const { time, weather_code, temperature_2m_max, temperature_2m_min } = weatherData.daily;
    const weatherMap: Record<string, WeatherInfo> = {};

    for (let i = 0; i < time.length; i++) {
      const dateIso = time[i]; // e.g. "2024-06-15"
      const code = weather_code[i];
      const maxTemp = Math.round(temperature_2m_max[i]);
      const minTemp = Math.round(temperature_2m_min[i]);

      // Check extreme conditions
      // Thunderstorms (95, 96, 99), Heavy Rain (65, 82), Heavy Snow (75, 86), Freezing Rain (66, 67), Extreme Temps
      const isExtremeCode = [65, 66, 67, 75, 82, 86, 95, 96, 99].includes(code);
      const isExtremeTemp = maxTemp > 40 || minTemp < -10;

      weatherMap[dateIso] = {
        date: dateIso,
        maxTemp,
        minTemp,
        code,
        isForecast: true,
        isExtreme: isExtremeCode || isExtremeTemp
      };
    }

    // 3. Fallback logic: If trip is completely out of range, we might just return the current weather 
    // mapped to the trip dates.
    // The user requested: "if within 10 days forecast, else current weather".
    // We fetched 16 days. If the trip dates aren't in this map, we'll map the FIRST day of the forecast 
    // (which is "today") to the trip dates to show "Current" weather.
    const todayWeather = weatherMap[time[0]];
    if (todayWeather) {
      let currentCheckDate = new Date(startDate);
      const endCheckDate = new Date(endDate);
      
      while (currentCheckDate <= endCheckDate) {
        const iso = currentCheckDate.toISOString().split('T')[0];
        if (!weatherMap[iso]) {
          weatherMap[iso] = {
            ...todayWeather,
            date: iso,
            isForecast: false // meaning "Current" placeholder
          };
        }
        currentCheckDate.setDate(currentCheckDate.getDate() + 1);
      }
    }

    return weatherMap;
  } catch (error) {
    console.error('Failed to fetch weather:', error);
    return {};
  }
};
