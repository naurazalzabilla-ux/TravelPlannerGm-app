import React, { useState, useCallback, useMemo } from 'react';
import InputGroup from './components/InputGroup';
import Button from './components/Button';
import { generateItinerary } from './services/geminiService';
import { DayItinerary, Activity, GroundingLink } from './types';

// Helper function to parse the markdown response into structured data
const parseItineraryMarkdown = (markdown: string): DayItinerary[] => {
  const days: DayItinerary[] = [];
  const daySections = markdown.split(/## Hari (\d+)\n/).filter(Boolean); // Split by "## Hari X"

  for (let i = 0; i < daySections.length; i += 2) {
    const dayNumber = parseInt(daySections[i].trim(), 10);
    const dayContent = daySections[i + 1];

    if (isNaN(dayNumber) || !dayContent) {
      console.warn(`Skipping malformed day section: ${daySections[i]} - ${daySections[i + 1]}`);
      continue;
    }

    const activities: Activity[] = [];
    // Split by "### Activity Name\n" - note the newline
    const activitySections = dayContent.split(/### (.+?)\n/g).filter(Boolean);

    for (let j = 0; j < activitySections.length; j += 2) {
      const activityName = activitySections[j].trim();
      const activityDetails = activitySections[j + 1];

      if (!activityName || !activityDetails) {
        console.warn(`Skipping malformed activity section: ${activitySections[j]} - ${activitySections[j + 1]}`);
        continue;
      }

      const hoursMatch = activityDetails.match(/- \*\*Jam Buka\/Tutup\*\*:\s*(.+)/);
      const costMatch = activityDetails.match(/- \*\*Estimasi Biaya\*\*:\s*(.+)/);
      const linkMatch = activityDetails.match(/\[Cek Harga\]\((#.*?)\)/);

      let estimatedCostValue = 0;
      let estimatedCostCurrency = 'IDR'; // Default currency

      if (costMatch && costMatch[1]) {
        const fullCostString = costMatch[1].trim(); // e.g., "5000 JPY"
        const numMatch = fullCostString.match(/(\d[\d,.]*)/); // Extract number
        if (numMatch && numMatch[1]) {
          estimatedCostValue = parseFloat(numMatch[1].replace(/,/g, ''));
        }
        const currencyMatch = fullCostString.match(/([A-Z]{2,4})$/); // Extract 2-4 uppercase letters at the end for currency code
        if (currencyMatch && currencyMatch[1]) {
          estimatedCostCurrency = currencyMatch[1];
        }
      }

      activities.push({
        name: activityName,
        hours: hoursMatch ? hoursMatch[1].trim() : 'N/A',
        estimatedCostValue,
        estimatedCostCurrency,
        checkPriceLink: linkMatch ? linkMatch[1].trim() : '#',
        actualCost: null, // Initialize actualCost as null
      });
    }
    days.push({ day: dayNumber, activities });
  }
  return days;
};


function App() {
  const [destination, setDestination] = useState<string>('');
  const [duration, setDuration] = useState<number>(1);
  const [interests, setInterests] = useState<string>('');
  const [totalBudget, setTotalBudget] = useState<number | ''>(''); // New state for total budget
  const [itinerary, setItinerary] = useState<DayItinerary[] | null>(null);
  const [groundingLinks, setGroundingLinks] = useState<GroundingLink[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateItinerary = useCallback(async () => {
    setError(null);
    setLoading(true);
    setItinerary(null);
    setGroundingLinks([]);

    if (!destination || !duration || !interests) {
      setError('Harap lengkapi semua kolom (Tujuan Wisata, Durasi, Minat Khusus).');
      setLoading(false);
      return;
    }

    try {
      const { itineraryMarkdown, groundingLinks: fetchedGroundingLinks } = await generateItinerary(
        destination,
        duration,
        interests
      );
      const parsedItinerary = parseItineraryMarkdown(itineraryMarkdown);
      setItinerary(parsedItinerary);
      setGroundingLinks(fetchedGroundingLinks);
    } catch (err: any) {
      console.error("Error in App component:", err);
      setError(err.message || 'Gagal membuat rencana perjalanan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  }, [destination, duration, interests]);

  const handleActualCostChange = useCallback((dayNum: number, activityIdx: number, newCost: number | null) => {
    setItinerary(prevItinerary => {
      if (!prevItinerary) return null;
      return prevItinerary.map(dayPlan => {
        if (dayPlan.day === dayNum) {
          return {
            ...dayPlan,
            activities: dayPlan.activities.map((activity, idx) =>
              idx === activityIdx ? { ...activity, actualCost: newCost } : activity
            ),
          };
        }
        return dayPlan;
      });
    });
  }, []);

  const inferredCurrency = useMemo(() => {
    if (itinerary && itinerary.length > 0 && itinerary[0].activities.length > 0) {
      return itinerary[0].activities[0].estimatedCostCurrency;
    }
    return 'IDR'; // Default if no itinerary or activities
  }, [itinerary]);

  const formatCurrency = useCallback((amount: number | null, currencyCode: string = inferredCurrency): string => {
    if (amount === null || isNaN(amount)) return `N/A ${currencyCode}`;
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }, [inferredCurrency]);

  const parsedTotalBudget = typeof totalBudget === 'number' ? totalBudget : (parseFloat(totalBudget || '0') || 0);

  const totalEstimatedCost = useMemo(() => {
    if (!itinerary) return 0;
    return itinerary.reduce((sum, dayPlan) => {
      return sum + dayPlan.activities.reduce((daySum, activity) => daySum + activity.estimatedCostValue, 0);
    }, 0);
  }, [itinerary]);

  const totalActualCost = useMemo(() => {
    if (!itinerary) return 0;
    return itinerary.reduce((sum, dayPlan) => {
      return sum + dayPlan.activities.reduce((daySum, activity) => daySum + (activity.actualCost || 0), 0);
    }, 0);
  }, [itinerary]);

  const costForBudgetComparison = totalActualCost > 0 ? totalActualCost : totalEstimatedCost;
  const remainingBudget = parsedTotalBudget - costForBudgetComparison;
  const averageDailyRemainingBudget = duration > 0 ? remainingBudget / duration : 0;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl bg-white shadow-lg rounded-xl p-6 sm:p-8 lg:p-10 mb-8">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-center text-blue-800 mb-8">
          AI Travel Planner
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"> {/* Adjusted grid for total budget */}
          <InputGroup
            label="Tujuan Wisata"
            id="destination"
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Contoh: Kyoto, Japan"
          />
          <InputGroup
            label="Durasi (Hari)"
            id="duration"
            type="number"
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value, 10) || 1)}
            min={1}
            placeholder="Contoh: 5"
          />
          <InputGroup
            label="Minat Khusus"
            id="interests"
            type="text"
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder="Contoh: Kuliner dan Sejarah"
          />
          <InputGroup
            label="Anggaran Total Anda"
            id="totalBudget"
            type="number"
            value={totalBudget}
            onChange={(e) => setTotalBudget(parseFloat(e.target.value) || '')}
            min={0}
            placeholder="Contoh: 10000000"
          />
        </div>

        <div className="flex justify-center mt-6">
          <Button onClick={handleGenerateItinerary} disabled={loading}>
            {loading ? 'Membuat Rencana...' : 'Buat Rencana Perjalanan'}
          </Button>
        </div>

        {error && (
          <div className="mt-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg text-center" role="alert">
            {error}
          </div>
        )}
      </div>

      {itinerary && itinerary.length > 0 && (
        <div className="w-full max-w-4xl">
          <h2 className="text-3xl font-bold text-center text-blue-700 mb-6">Rencana Perjalanan Anda</h2>

          {groundingLinks.length > 0 && (
            <div className="bg-blue-50 border-l-4 border-blue-400 text-blue-800 p-4 mb-6 shadow-md rounded-md">
              <p className="font-semibold mb-2">Sumber Informasi:</p>
              <ul className="list-disc pl-5 space-y-1">
                {groundingLinks.map((link, index) => (
                  <li key={index}>
                    <a
                      href={link.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm"
                    >
                      {link.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {itinerary.map((dayPlan) => (
              <div key={dayPlan.day} className="bg-white rounded-lg shadow-md overflow-hidden transform hover:scale-105 transition-transform duration-200 ease-in-out">
                <div className="bg-blue-500 text-white p-4 text-center font-bold text-xl">
                  Hari {dayPlan.day}
                </div>
                <div className="p-4">
                  {dayPlan.activities.length > 0 ? (
                    <ul className="space-y-4">
                      {dayPlan.activities.map((activity, index) => (
                        <li key={index} className="border-b pb-4 last:border-b-0 last:pb-0">
                          <h3 className="font-semibold text-lg text-blue-700 mb-1 flex items-center gap-2">
                            {activity.name}
                            {groundingLinks.length > 0 && (
                              <span
                                title="Informasi diverifikasi secara real-time"
                                className="text-blue-500"
                                aria-hidden="true" // For accessibility, as title provides the context
                              >
                                {/* Globe SVG Icon */}
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                                  <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm0 1.5a8.25 8.25 0 0 0-.715.034 8.243 8.243 0 0 1-.72 1.486 8.212 8.212 0 0 0-3.086 4.393C4.544 11.2 4.71 12.06 5.008 13.013l.808 2.373A8.204 8.204 0 0 0 12 20.25a8.204 8.204 0 0 0 6.184-4.864l.808-2.373c.298-.953.464-1.813.438-2.731a8.212 8.212 0 0 0-3.086-4.393 8.243 8.243 0 0 1-.72-1.486A8.25 8.25 0 0 0 12 3.75ZM6.591 8.76a.75.75 0 0 1 .432-.977 3.321 3.321 0 0 1 1.053-.293c.96-.062 1.839.23 2.502.684.34.237.64.5.908.795a.75.75 0 0 1-1.06 1.06c-.22-.22-.444-.436-.677-.645-.58-.46-1.226-.7-1.836-.73-.55-.028-1.096.104-1.486.377a.75.75 0 0 1-.977-.432Zm7.766 6.84a.75.75 0 0 1 .977-.432c.39.273.936.405 1.486.377.61-.03 1.256-.27 1.836-.73.233-.209.457-.425.677-.645a.75.75 0 1 1 1.06 1.06c-.268.295-.568.558-.908.795-.663.454-1.542.746-2.502.684a3.321 3.321 0 0 1-1.053-.293.75.75 0 0 1-.432-.977Z" clipRule="evenodd" />
                                </svg>
                              </span>
                            )}
                          </h3>
                          <p className="text-sm text-gray-600">
                            <span className="font-medium">Jam:</span> {activity.hours}
                          </p>                          
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm text-gray-600 mb-2 gap-2">
                            <span>
                              <span className="font-medium">Estimasi Biaya:</span> {formatCurrency(activity.estimatedCostValue, activity.estimatedCostCurrency)}
                            </span>
                            <div className="flex items-center gap-2">
                              <label htmlFor={`actual-cost-${dayPlan.day}-${index}`} className="font-medium text-gray-700 whitespace-nowrap">
                                Aktual:
                              </label>
                              <input
                                type="number"
                                id={`actual-cost-${dayPlan.day}-${index}`}
                                placeholder="Input Biaya"
                                value={activity.actualCost !== null ? activity.actualCost : ''}
                                onChange={(e) => handleActualCostChange(dayPlan.day, index, parseFloat(e.target.value) || null)}
                                className="w-28 py-1 px-2 border rounded text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                                aria-label={`Biaya aktual untuk ${activity.name}`}
                              />
                            </div>
                          </div>
                          <a
                            href={activity.checkPriceLink !== '#' ? activity.checkPriceLink : '#'}
                            target={activity.checkPriceLink !== '#' ? '_blank' : '_self'}
                            rel="noopener noreferrer"
                            className="inline-block mt-2 bg-green-500 hover:bg-green-600 text-white text-xs font-bold py-1 px-3 rounded transition-colors duration-200"
                          >
                            Cek Harga
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-500 italic text-center">Tidak ada aktivitas yang ditemukan untuk hari ini.</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6 mt-8">
            <h2 className="text-2xl font-bold text-blue-700 mb-4">Ringkasan Anggaran</h2>
            <div className="space-y-2 text-gray-700">
              <p className="flex justify-between items-center">
                <span className="font-semibold">Total Estimasi Biaya Perjalanan (Subtotal):</span>
                <span className="text-xl font-bold text-blue-600">{formatCurrency(totalEstimatedCost)}</span>
              </p>
              <p className="flex justify-between items-center">
                <span className="font-semibold">Total Biaya Aktual Saat Ini:</span>
                <span className="text-xl font-bold text-green-600">{formatCurrency(totalActualCost)}</span>
              </p>
              {parsedTotalBudget > 0 && (
                <>
                  <p className="flex justify-between items-center">
                    <span className="font-semibold">Anggaran Total Anda:</span>
                    <span className="text-xl font-bold text-purple-600">{formatCurrency(parsedTotalBudget)}</span>
                  </p>
                  <p className="flex justify-between items-center border-t pt-4 mt-4">
                    <span className="font-semibold text-lg">Sisa Anggaran Harian Rata-rata yang Direkomendasikan:</span>
                    <span className={`text-xl font-bold ${averageDailyRemainingBudget >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(averageDailyRemainingBudget)}
                    </span>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;