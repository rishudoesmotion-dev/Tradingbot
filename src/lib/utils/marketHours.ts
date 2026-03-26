/**
 * Check if current time is within Indian stock market trading hours
 * Market Hours: 09:15 AM - 03:30 PM IST (Mon-Fri, excluding holidays)
 */

/**
 * NSE Market Holidays 2026
 * Official NSE Holiday Calendar
 * Source: https://www.nseindia.com/
 */
const NSE_HOLIDAYS_2026 = [
  new Date(2026, 0, 15),  // 15 JAN - Municipal Corporation Election - Maharashtra
  new Date(2026, 0, 26),  // 26 JAN - Republic Day
  new Date(2026, 2, 3),   // 03 MAR - Holi
  new Date(2026, 2, 26),  // 26 MAR - Shri Ram Navami
  new Date(2026, 2, 31),  // 31 MAR - Shri Mahavir Jayanti
  new Date(2026, 3, 3),   // 03 APR - Good Friday
  new Date(2026, 3, 14),  // 14 APR - Dr. Baba Saheb Ambedkar Jayanti
  new Date(2026, 4, 1),   // 01 MAY - Maharashtra Day
  new Date(2026, 4, 28),  // 28 MAY - Bakri Id
  new Date(2026, 5, 26),  // 26 JUN - Muharram
  new Date(2026, 8, 14),  // 14 SEP - Ganesh Chaturthi
  new Date(2026, 9, 2),   // 02 OCT - Mahatma Gandhi Jayanti
  new Date(2026, 9, 20),  // 20 OCT - Dussehra
  new Date(2026, 10, 10), // 10 NOV - Diwali-Balipratipada
  new Date(2026, 10, 24), // 24 NOV - Prakash Gurpurb Sri Guru Nanak Dev
  new Date(2026, 11, 25), // 25 DEC - Christmas
];

const HOLIDAY_NAMES: Record<string, string> = {
  '15-1-2026': 'Municipal Corporation Election - Maharashtra',
  '26-1-2026': 'Republic Day',
  '3-3-2026': 'Holi',
  '26-3-2026': 'Shri Ram Navami',
  '31-3-2026': 'Shri Mahavir Jayanti',
  '3-4-2026': 'Good Friday',
  '14-4-2026': 'Dr. Baba Saheb Ambedkar Jayanti',
  '1-5-2026': 'Maharashtra Day',
  '28-5-2026': 'Bakri Id',
  '26-6-2026': 'Muharram',
  '14-9-2026': 'Ganesh Chaturthi',
  '2-10-2026': 'Mahatma Gandhi Jayanti',
  '20-10-2026': 'Dussehra',
  '10-11-2026': 'Diwali-Balipratipada',
  '24-11-2026': 'Prakash Gurpurb Sri Guru Nanak Dev',
  '25-12-2026': 'Christmas',
};

/**
 * Check if a specific date is a market holiday
 */
function isMarketHoliday(date: Date): boolean {
  const dateStr = date.toDateString();
  return NSE_HOLIDAYS_2026.some(holiday => holiday.toDateString() === dateStr);
}

/**
 * Get holiday name if date is a holiday, null otherwise
 */
export function getHolidayName(date: Date): string | null {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const key = `${day}-${month}-${year}`;
  return HOLIDAY_NAMES[key] || null;
}

export function isMarketOpen(): boolean {
  // Create date in IST (UTC+5:30)
  const now = new Date();
  const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
  
  const hours = istTime.getHours();
  const minutes = istTime.getMinutes();
  const day = istTime.getDay();
  
  // Check if weekday (1 = Monday, 5 = Friday)
  const isWeekday = day >= 1 && day <= 5;
  
  // Check if market holiday
  const isHoliday = isMarketHoliday(istTime);
  if (isHoliday) {
    return false;
  }
  
  // Check if within market hours: 09:15 - 15:30 (3:30 PM)
  const currentMinutes = hours * 60 + minutes;
  const marketOpenMinutes = 9 * 60 + 15;  // 09:15
  const marketCloseMinutes = 15 * 60 + 30; // 15:30
  
  return isWeekday && currentMinutes >= marketOpenMinutes && currentMinutes <= marketCloseMinutes;
}

/**
 * Get time until market opens (or closes)
 * Returns: { isOpen, minutesUntilChange, message, holidayName? }
 */
export function getMarketStatus() {
  const now = new Date();
  const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000) - (now.getTimezoneOffset() * 60 * 1000));
  
  const hours = istTime.getHours();
  const minutes = istTime.getMinutes();
  const day = istTime.getDay();
  
  const isWeekday = day >= 1 && day <= 5;
  const currentMinutes = hours * 60 + minutes;
  const marketOpenMinutes = 9 * 60 + 15;  // 09:15
  const marketCloseMinutes = 15 * 60 + 30; // 15:30
  
  // Check for holiday
  const isHoliday = isMarketHoliday(istTime);
  const holidayName = isHoliday ? getHolidayName(istTime) : null;
  
  const isOpen = isWeekday && !isHoliday && currentMinutes >= marketOpenMinutes && currentMinutes <= marketCloseMinutes;
  
  let minutesUntilChange = 0;
  let message = '';
  
  if (isHoliday) {
    // Holiday - market closed
    message = `Market closed - ${holidayName || 'Holiday'}`;
    minutesUntilChange = 24 * 60; // Until tomorrow
  } else if (!isWeekday) {
    // Weekend - market closed until Monday 9:15 AM
    const daysUntilMonday = (8 - day) % 7 || 1;
    minutesUntilChange = (24 * 60 * daysUntilMonday) - currentMinutes;
    message = `Market closed (weekend). Opens Monday 09:15 IST`;
  } else if (currentMinutes < marketOpenMinutes) {
    // Before market opens
    minutesUntilChange = marketOpenMinutes - currentMinutes;
    message = `Market opens at 09:15 IST (${minutesUntilChange} mins)`;
  } else if (currentMinutes > marketCloseMinutes) {
    // After market closes
    minutesUntilChange = (24 * 60) - currentMinutes + marketOpenMinutes;
    message = `Market closed. Opens tomorrow 09:15 IST`;
  } else {
    // Market open
    minutesUntilChange = marketCloseMinutes - currentMinutes;
    message = `Market open. Closes at 15:30 IST (${minutesUntilChange} mins)`;
  }
  
  return { isOpen, minutesUntilChange, message, holidayName };
}
