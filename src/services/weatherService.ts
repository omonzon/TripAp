export interface WeatherInfo {
  date: string;
  maxTemp: number;
  minTemp: number;
  code: number;
  windSpeed: number;
  precipitation: number;
  isForecast: boolean;
  isExtreme: boolean;
  locationName?: string;
  warnings?: string[];
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
  days: { isoDate: string; title: string; locationNameEn?: string }[],
  destinations: string[], 
  startDate: string, 
  endDate: string
): Promise<Record<string, WeatherInfo>> => {
  if (!destinations || destinations.length === 0 || days.length === 0) return {};

  const weatherMap: Record<string, WeatherInfo> = {};
  const geoCache: Record<string, { lat: number, lng: number } | null> = {};
  const weatherCache: Record<string, any> = {};

  // Sort days by date just in case
  const sortedDays = [...days].sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  
  let lastKnownLocation = destinations[0];

  for (const day of sortedDays) {
    // 1. Determine location for this day
    let dayLocation = day.locationNameEn || lastKnownLocation;
    
    // If no specific English name is stored, try to match destination names as a fallback
    if (!day.locationNameEn) {
      for (const dest of destinations) {
        if (day.title.toLowerCase().includes(dest.toLowerCase())) {
          dayLocation = dest;
          break;
        }
      }
    }
    lastKnownLocation = dayLocation;

    // 2. Geocode if not cached
    if (geoCache[dayLocation] === undefined) {
      try {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(dayLocation)}&count=1&language=en&format=json`);
        const geoData = await geoRes.json();
        if (geoData.results && geoData.results.length > 0) {
          geoCache[dayLocation] = { lat: geoData.results[0].latitude, lng: geoData.results[0].longitude };
        } else {
          geoCache[dayLocation] = null;
        }
      } catch (err) {
        geoCache[dayLocation] = null;
      }
    }

    const coords = geoCache[dayLocation];
    if (!coords) continue;

    // 3. Fetch weather for coords if not cached
    const coordKey = `${coords.lat},${coords.lng}`;
    if (!weatherCache[coordKey]) {
      try {
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max&timezone=auto&forecast_days=16`);
        weatherCache[coordKey] = await weatherRes.json();
      } catch (err) {
        weatherCache[coordKey] = null;
      }
    }

    const weatherData = weatherCache[coordKey];
    if (!weatherData || !weatherData.daily || !weatherData.daily.time) continue;

    // 4. Find weather for this specific day's date
    const { time, weather_code, temperature_2m_max, temperature_2m_min, precipitation_sum, wind_speed_10m_max } = weatherData.daily;
    const dateIdx = time.indexOf(day.isoDate);

    const processDayWeather = (idx: number, isForecast: boolean) => {
      const code = weather_code[idx];
      const maxTemp = Math.round(temperature_2m_max[idx]);
      const minTemp = Math.round(temperature_2m_min[idx]);
      const precipitation = precipitation_sum?.[idx] || 0;
      const windSpeed = Math.round(wind_speed_10m_max?.[idx] || 0);

      const isExtremeCode = [65, 66, 67, 75, 82, 86, 95, 96, 99].includes(code);
      const isExtremeTemp = maxTemp > 40 || minTemp < -10;
      const isExtremeWind = windSpeed > 50;
      const isExtremeRain = precipitation > 20;

      const warnings: string[] = [];
      if (maxTemp > 40) warnings.push('חום קיצוני');
      if (minTemp < -5) warnings.push('קור קיצוני');
      if (isExtremeWind) warnings.push('רוחות חזקות');
      if (isExtremeRain) warnings.push('גשם כבד');
      if ([95, 96, 99].includes(code)) warnings.push('סופות רעמים');
      if ([75, 86].includes(code)) warnings.push('שלג כבד');

      return {
        date: day.isoDate,
        maxTemp,
        minTemp,
        code,
        windSpeed,
        precipitation,
        isForecast,
        isExtreme: isExtremeCode || isExtremeTemp || isExtremeWind || isExtremeRain,
        locationName: dayLocation,
        warnings
      };
    };

    if (dateIdx !== -1) {
      weatherMap[day.isoDate] = processDayWeather(dateIdx, true);
    } else {
      // Date is out of 16-day range, use "today's" weather (index 0) as fallback
      weatherMap[day.isoDate] = processDayWeather(0, false);
    }
  }

  return weatherMap;
};
