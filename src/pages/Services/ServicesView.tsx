import React from 'react';
import { useTranslation } from 'react-i18next';
import { Briefcase, Plane, Hotel, Car, Shield, ExternalLink, Map, Coffee } from 'lucide-react';

const AFFILIATES = [
  {
    id: 'flights',
    title: 'Flights & Tickets',
    icon: <Plane size={24} className="text-blue-500" />,
    items: [
      { name: 'Skyscanner', url: 'https://www.skyscanner.net', desc: 'Find the cheapest flights globally.' },
      { name: 'Kiwi.com', url: 'https://www.kiwi.com', desc: 'Great for multi-city combinations.' },
    ]
  },
  {
    id: 'hotels',
    title: 'Accommodation',
    icon: <Hotel size={24} className="text-indigo-500" />,
    items: [
      { name: 'Booking.com', url: 'https://www.booking.com', desc: 'World\'s leading hotel booking platform.' },
      { name: 'Airbnb', url: 'https://www.airbnb.com', desc: 'Unique homes and experiences.' },
      { name: 'Agoda', url: 'https://www.agoda.com', desc: 'Best deals in Asia and beyond.' },
    ]
  },
  {
    id: 'transport',
    title: 'Transport & Rentals',
    icon: <Car size={24} className="text-emerald-500" />,
    items: [
      { name: 'Rentalcars.com', url: 'https://www.rentalcars.com', desc: 'Compare car rental deals.' },
      { name: 'Uber', url: 'https://www.uber.com', desc: 'Ride-sharing worldwide.' },
    ]
  },
  {
    id: 'activities',
    title: 'Activities & Tours',
    icon: <Map size={24} className="text-orange-500" />,
    items: [
      { name: 'GetYourGuide', url: 'https://www.getyourguide.com', desc: 'Book tours and attractions.' },
      { name: 'Viator', url: 'https://www.viator.com', desc: 'TripAdvisor company for experiences.' },
      { name: 'Klook', url: 'https://www.klook.com', desc: 'Top activities in Asia.' },
    ]
  },
  {
    id: 'insurance',
    title: 'Travel Insurance',
    icon: <Shield size={24} className="text-red-500" />,
    items: [
      { name: 'SafetyWing', url: 'https://safetywing.com', desc: 'Medical and travel insurance for nomads.' },
      { name: 'World Nomads', url: 'https://www.worldnomads.com', desc: 'Flexible travel insurance.' },
    ]
  }
];

export default function ServicesView() {
  const { t } = useTranslation();

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-10">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-brand-100 dark:bg-brand-900/30 text-brand-600 flex items-center justify-center shadow-sm border border-brand-200 dark:border-brand-800">
          <Briefcase size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {t('tabs.services', 'Services & Offers')}
          </h1>
          <p className="text-sm text-slate-500">
            Recommended travel services, bookings, and affiliate partners.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {AFFILIATES.map((category) => (
          <div key={category.id} className="card p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="flex items-center gap-2 mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
              {category.icon}
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">{category.title}</h2>
            </div>
            <div className="space-y-3">
              {category.items.map((item, idx) => (
                <a
                  key={idx}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex flex-col p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-900 dark:text-white group-hover:text-brand-500 transition-colors">
                      {item.name}
                    </span>
                    <ExternalLink size={14} className="text-slate-400 group-hover:text-brand-500" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-8 p-4 bg-brand-50 dark:bg-brand-900/20 rounded-xl border border-brand-200 dark:border-brand-800 flex items-start gap-3">
        <Coffee size={24} className="text-brand-600 mt-1 shrink-0" />
        <p className="text-sm text-brand-800 dark:text-brand-200">
          <strong>Support our platform!</strong> Booking through these links helps us keep this app free by earning a small commission at no extra cost to you.
        </p>
      </div>
    </div>
  );
}
