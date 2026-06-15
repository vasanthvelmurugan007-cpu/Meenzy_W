function getKolkataTime() {
  const now = new Date();
  const kolkataStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
  return new Date(kolkataStr);
}

function getDateName(offset) {
  const targetDate = module.exports.getKolkataTime();
  targetDate.setDate(targetDate.getDate() + offset);
  
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  
  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  return `${weekdayNames[targetDate.getDay()]}, ${monthNames[targetDate.getMonth()]} ${targetDate.getDate()}`;
}

function getSlotsForOffset(offset) {
  const targetDate = module.exports.getKolkataTime();
  targetDate.setDate(targetDate.getDate() + offset);
  const dayOfWeek = targetDate.getDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
  
  const morningTime = isWeekend ? "6 AM - 9:30 AM" : "6 AM - 8:30 AM";
  const morningSlot = `Morning (${morningTime})`;
  
  if (offset === 0) {
    // Today: only evening delivery is possible
    return [
      { id: `C_DEL:0:Evening (4 PM - 7 PM)`, title: "Evening Delivery", description: "4 PM - 7 PM" }
    ];
  }
  
  return [
    { id: `C_DEL:${offset}:${morningSlot}`, title: `${isWeekend ? "Weekend" : "Weekday"} Morning`, description: morningTime },
    { id: `C_DEL:${offset}:Mid-Day (11 AM - 2 PM)`, title: "Mid-Day Delivery", description: "11 AM - 2 PM" },
    { id: `C_DEL:${offset}:Evening (4 PM - 7 PM)`, title: "Evening Delivery", description: "4 PM - 7 PM" }
  ];
}

function getDeliveryPayload() {
  const localNow = module.exports.getKolkataTime();
  const hours = localNow.getHours();
  const minutes = localNow.getMinutes();
  
  const isPastCutoff = (hours > 23) || (hours === 23 && minutes >= 55);
  const isPastEveningDelivery = (hours >= 19); // Past 7:00 PM
  
  const sections = [];
  
  if (isPastCutoff) {
    // After 11:55 PM: Tuesday is closed. Show Wednesday (offset 2) and Thursday (offset 3)
    sections.push({
      title: getDateName(2),
      rows: getSlotsForOffset(2)
    });
    sections.push({
      title: getDateName(3),
      rows: getSlotsForOffset(3)
    });
  } else if (isPastEveningDelivery) {
    // Past 7:00 PM: Today is gone. Show Tomorrow (offset 1) and Day After Tomorrow (offset 2)
    sections.push({
      title: getDateName(1),
      rows: getSlotsForOffset(1)
    });
    sections.push({
      title: getDateName(2),
      rows: getSlotsForOffset(2)
    });
  } else {
    // Normal: Show Today (offset 0, evening only) and Tomorrow (offset 1, all slots)
    sections.push({
      title: getDateName(0),
      rows: getSlotsForOffset(0)
    });
    sections.push({
      title: getDateName(1),
      rows: getSlotsForOffset(1)
    });
  }
  
  return {
    type: "list",
    body: { text: "📅 When would you like your order delivered? Please select a date and time slot below:" },
    action: {
      button: "Select Schedule",
      sections: sections
    }
  };
}

function getTomorrowMorningSlot() {
  const localNow = module.exports.getKolkataTime();
  const hours = localNow.getHours();
  const minutes = localNow.getMinutes();
  const isPastCutoff = (hours > 23) || (hours === 23 && minutes >= 55);

  const targetDate = new Date(localNow);
  if (isPastCutoff) {
    // Cutoff passed, earliest tomorrow is Wednesday (offset 2)
    targetDate.setDate(targetDate.getDate() + 2);
  } else {
    // Normal, tomorrow is Tomorrow (offset 1)
    targetDate.setDate(targetDate.getDate() + 1);
  }

  const dayOfWeek = targetDate.getDay();
  const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
  return isWeekend ? "Morning (6 AM - 9:30 AM)" : "Morning (6 AM - 8:30 AM)";
}

module.exports = {
  getDeliveryPayload,
  getTomorrowMorningSlot,
  getKolkataTime
};
