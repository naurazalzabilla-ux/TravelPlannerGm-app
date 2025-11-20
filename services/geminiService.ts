import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GroundingLink } from '../types';

interface GenerateItineraryResult {
  itineraryMarkdown: string;
  groundingLinks: GroundingLink[];
}

export async function generateItinerary(
  destination: string,
  duration: number,
  interests: string
): Promise<GenerateItineraryResult> {
  if (typeof process === 'undefined' || !process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set. Please ensure it is configured.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `Sebagai perencana perjalanan profesional, buatlah rencana perjalanan ${duration} hari yang terperinci untuk "${destination}", dengan fokus pada "${interests}".
Untuk setiap hari, cantumkan aktivitas dengan perkiraan jam buka/tutup, perkiraan biaya dalam mata uang lokal, dan sertakan tautan placeholder untuk memeriksa harga.
Gunakan informasi real-time dan terkini.
Format output secara ketat dalam Markdown terstruktur sebagai berikut:

## Hari 1
### [Nama Aktivitas 1]
- **Jam Buka/Tutup**: [Jam Buka] - [Jam Tutup]
- **Estimasi Biaya**: [Biaya dalam Mata Uang Lokal, contoh: 5000 JPY]
- [Cek Harga](#)

### [Nama Aktivitas 2]
- **Jam Buka/Tutup**: [Jam Buka] - [Jam Tutup]
- **Estimasi Biaya**: [Biaya dalam Mata Uang Lokal]
- [Cek Harga](#)

## Hari 2
... dan seterusnya selama ${duration} hari.

Pastikan mata uang selalu disebutkan secara eksplisit (misalnya, "JPY", "USD", "EUR").`;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
      },
    });

    const itineraryMarkdown = response.text || '';
    const groundingLinks: GroundingLink[] = [];

    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      for (const chunk of response.candidates[0].groundingMetadata.groundingChunks) {
        if ('web' in chunk && chunk.web?.uri) {
          groundingLinks.push({
            uri: chunk.web.uri,
            title: chunk.web.title || chunk.web.uri,
          });
        }
      }
    }

    return { itineraryMarkdown, groundingLinks };
  } catch (error) {
    console.error("Error generating itinerary:", error);
    // Specific error handling for API key issues if they arise
    if (error instanceof Error && error.message.includes("403 Forbidden") || error.message.includes("API key not valid")) {
       throw new Error("API key might be invalid or not properly configured. Please check your environment variables.");
    }
    throw new Error("Gagal membuat rencana perjalanan. Silakan coba lagi. " + (error instanceof Error ? error.message : ''));
  }
}
