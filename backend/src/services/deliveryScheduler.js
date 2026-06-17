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

function getDaysDifference(date1, date2) {
  const d1 = new Date(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const d2 = new Date(date2.getFullYear(), date2.getMonth(), date2.getDate());
  const diffTime = d2 - d1;
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

function getDeliveryPayload() {
  const localNow = module.exports.getKolkataTime();
  const hours = localNow.getHours();
  const minutes = localNow.getMinutes();
  
  const isPastCutoff = (hours > 23) || (hours === 23 && minutes >= 59);
  const isPastEveningDelivery = (hours >= 19); // Past 7:00 PM
  
  const baseStartOffset = isPastCutoff ? 2 : (isPastEveningDelivery ? 1 : 0);
  
  const launchDate = new Date("2026-06-21T00:00:00+05:30");
  const launchOffset = getDaysDifference(localNow, launchDate);
  const startOffset = Math.max(baseStartOffset, launchOffset);
  
  const rows = [];
  for (let i = 0; i < 7; i++) {
    const currentOffset = startOffset + i;
    const dateTitle = getDateName(currentOffset);
    rows.push({
      id: `C_DATE:${currentOffset}`,
      title: dateTitle,
      description: `Select to view delivery slots for ${dateTitle}`
    });
  }
  
  return {
    type: "list",
    body: { text: "📅 When would you like your order delivered? Please select a date below:" },
    action: {
      button: "Select Date",
      sections: [
        {
          title: "Available Dates",
          rows: rows
        }
      ]
    }
  };
}

function getSlotsPayloadForDate(offset) {
  const targetDate = module.exports.getKolkataTime();
  targetDate.setDate(targetDate.getDate() + offset);
  
  const dateTitle = getDateName(offset);
  const slots = getSlotsForOffset(offset);
  
  const buttons = slots.map(slot => {
    let btnTitle = slot.title;
    if (btnTitle.toLowerCase().includes('morning')) {
      btnTitle = 'Morning 🌅';
    } else if (btnTitle.toLowerCase().includes('mid-day')) {
      btnTitle = 'Mid-Day ☀️';
    } else if (btnTitle.toLowerCase().includes('evening')) {
      btnTitle = 'Evening 🌇';
    }
    
    return {
      type: "reply",
      reply: {
        id: slot.id,
        title: btnTitle
      }
    };
  });
  
  return {
    type: "button",
    body: {
      text: `📅 *Select delivery time slot for ${dateTitle}:*`
    },
    action: {
      buttons: buttons
    }
  };
}

function getTomorrowMorningSlot() {
  const localNow = module.exports.getKolkataTime();
  const hours = localNow.getHours();
  const minutes = localNow.getMinutes();
  const isPastCutoff = (hours > 23) || (hours === 23 && minutes >= 59);

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
  getSlotsPayloadForDate,
  getTomorrowMorningSlot,
  getKolkataTime
};
