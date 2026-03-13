const fs = require("fs");


// ============================================================
// Helper Functions
// ============================================================

function parse12HourTime(timeStr) {
    let clean = timeStr.trim().toLowerCase();
    let [timePart, meridiem] = clean.split(" ");
    let [hours, minutes, seconds] = timePart.split(":").map(Number);

    if (meridiem === "am") {
        if (hours === 12) hours = 0;
    } else if (meridiem === "pm") {
        if (hours !== 12) hours += 12;
    }

    return hours * 3600 + minutes * 60 + seconds;
}

function parseDuration(durationStr) {
    let [hours, minutes, seconds] = durationStr.trim().split(":").map(Number);
    return hours * 3600 + minutes * 60 + seconds;
}

function formatDuration(totalSeconds) {
    let hours = Math.floor(totalSeconds / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;

    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getWeekdayName(dateStr) {
    let dateObj = new Date(dateStr + "T00:00:00");
    let days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[dateObj.getDay()];
}

function isEidPeriod(dateStr) {
    return dateStr >= "2025-04-10" && dateStr <= "2025-04-30";
}

function readShiftFile(textFile) {
    let content = fs.readFileSync(textFile, "utf8").trim();

    if (content === "") return [];

    let lines = content.split("\n");

    // Skip header if present
    let startIndex = 0;
    if (lines[0].toLowerCase().startsWith("driverid,")) {
        startIndex = 1;
    }

    let records = [];

    for (let i = startIndex; i < lines.length; i++) {
        let line = lines[i].trim();
        if (line === "") continue;

        let parts = line.split(",");

        records.push({
            driverID: parts[0].trim(),
            driverName: parts[1].trim(),
            date: parts[2].trim(),
            startTime: parts[3].trim(),
            endTime: parts[4].trim(),
            shiftDuration: parts[5].trim(),
            idleTime: parts[6].trim(),
            activeTime: parts[7].trim(),
            metQuota: parts[8].trim() === "true",
            hasBonus: parts[9].trim() === "true"
        });
    }

    return records;
}

function writeShiftFile(textFile, records) {
    let header = "DriverID,DriverName,Date,StartTime,EndTime,ShiftDuration,IdleTime,ActiveTime,MetQuota,HasBonus";

    let lines = records.map(record =>
        `${record.driverID},${record.driverName},${record.date},${record.startTime},${record.endTime},${record.shiftDuration},${record.idleTime},${record.activeTime},${record.metQuota},${record.hasBonus}`
    );

    fs.writeFileSync(textFile, [header, ...lines].join("\n"), "utf8");
}

function readRatesFile(rateFile) {
    let content = fs.readFileSync(rateFile, "utf8").trim();

    if (content === "") return [];

    let lines = content.split("\n");
    let rates = [];

    for (let line of lines) {
        line = line.trim();
        if (line === "") continue;

        let parts = line.split(",");

        rates.push({
            driverID: parts[0].trim(),
            dayOff: parts[1].trim(),
            basePay: Number(parts[2].trim()),
            tier: Number(parts[3].trim())
        });
    }

    return rates;
}


// ============================================================
// Function 1: getShiftDuration(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getShiftDuration(startTime, endTime) {
let startSeconds = parse12HourTime(startTime);
    let endSeconds = parse12HourTime(endTime);

    return formatDuration(endSeconds - startSeconds);
}

// ============================================================
// Function 2: getIdleTime(startTime, endTime)
// startTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// endTime: (typeof string) formatted as hh:mm:ss am or hh:mm:ss pm
// Returns: string formatted as h:mm:ss
// ============================================================
function getIdleTime(startTime, endTime) {
  let startSeconds = parse12HourTime(startTime);
    let endSeconds = parse12HourTime(endTime);

    let deliveryStart = 8 * 3600;   // 8:00 AM
    let deliveryEnd = 22 * 3600;    // 10:00 PM

    let idleBefore = 0;
    let idleAfter = 0;

    if (startSeconds < deliveryStart) {
        idleBefore = deliveryStart - startSeconds;
    }

    if (endSeconds > deliveryEnd) {
        idleAfter = endSeconds - deliveryEnd;
    }

    return formatDuration(idleBefore + idleAfter);
}

// ============================================================
// Function 3: getActiveTime(shiftDuration, idleTime)
// shiftDuration: (typeof string) formatted as h:mm:ss
// idleTime: (typeof string) formatted as h:mm:ss
// Returns: string formatted as h:mm:ss
// ============================================================
function getActiveTime(shiftDuration, idleTime) {
    let shiftSeconds = parseDuration(shiftDuration);
    let idleSeconds = parseDuration(idleTime);

    return formatDuration(shiftSeconds - idleSeconds);
}

// ============================================================
// Function 4: metQuota(date, activeTime)
// date: (typeof string) formatted as yyyy-mm-dd
// activeTime: (typeof string) formatted as h:mm:ss
// Returns: boolean
// ============================================================
function metQuota(date, activeTime) {
 let activeSeconds = parseDuration(activeTime);
    let requiredSeconds = isEidPeriod(date) ? (6 * 3600) : (8 * 3600 + 24 * 60);

    return activeSeconds >= requiredSeconds;
}

// ============================================================
// Function 5: addShiftRecord(textFile, shiftObj)
// textFile: (typeof string) path to shifts text file
// shiftObj: (typeof object) has driverID, driverName, date, startTime, endTime
// Returns: object with 10 properties or empty object {}
// ============================================================
function addShiftRecord(textFile, shiftObj) {
let records = readShiftFile(textFile);

    let duplicate = records.find(record =>
        record.driverID === shiftObj.driverID.trim() &&
        record.date === shiftObj.date.trim()
    );

    if (duplicate) {
        return {};
    }

    let startTime = shiftObj.startTime.trim();
    let endTime = shiftObj.endTime.trim();
    let date = shiftObj.date.trim();

    let shiftDuration = getShiftDuration(startTime, endTime);
    let idleTime = getIdleTime(startTime, endTime);
    let activeTime = getActiveTime(shiftDuration, idleTime);
    let quotaMet = metQuota(date, activeTime);

    let newRecord = {
        driverID: shiftObj.driverID.trim(),
        driverName: shiftObj.driverName.trim(),
        date: date,
        startTime: startTime,
        endTime: endTime,
        shiftDuration: shiftDuration,
        idleTime: idleTime,
        activeTime: activeTime,
        metQuota: quotaMet,
        hasBonus: false
    };

    let lastIndex = -1;
    for (let i = 0; i < records.length; i++) {
        if (records[i].driverID === newRecord.driverID) {
            lastIndex = i;
        }
    }

    if (lastIndex === -1) {
        records.push(newRecord);
    } else {
        records.splice(lastIndex + 1, 0, newRecord);
    }

    writeShiftFile(textFile, records);
    return newRecord;
}

// ============================================================
// Function 6: setBonus(textFile, driverID, date, newValue)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// date: (typeof string) formatted as yyyy-mm-dd
// newValue: (typeof boolean)
// Returns: nothing (void)
// ============================================================
function setBonus(textFile, driverID, date, newValue) {
      let records = readShiftFile(textFile);

    for (let record of records) {
        if (record.driverID === driverID && record.date === date) {
            record.hasBonus = newValue;
            break;
        }
    }

    writeShiftFile(textFile, records);
}

// ============================================================
// Function 7: countBonusPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof string) formatted as mm or m
// Returns: number (-1 if driverID not found)
// ============================================================
function countBonusPerMonth(textFile, driverID, month) {
    let records = readShiftFile(textFile);
    let targetMonth = String(Number(month)).padStart(2, "0");

    let driverExists = records.some(record => record.driverID === driverID);
    if (!driverExists) return -1;

    let count = 0;

    for (let record of records) {
        let recordMonth = record.date.split("-")[1];
        if (record.driverID === driverID && recordMonth === targetMonth && record.hasBonus === true) {
            count++;
        }
    }

    return count;
}

// ============================================================
// Function 8: getTotalActiveHoursPerMonth(textFile, driverID, month)
// textFile: (typeof string) path to shifts text file
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getTotalActiveHoursPerMonth(textFile, driverID, month) {
 let records = readShiftFile(textFile);
    let totalSeconds = 0;

    for (let record of records) {
        let recordMonth = Number(record.date.split("-")[1]);

        if (record.driverID === driverID && recordMonth === month) {
            totalSeconds += parseDuration(record.activeTime);
        }
    }

    return formatDuration(totalSeconds);
}

// ============================================================
// Function 9: getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month)
// textFile: (typeof string) path to shifts text file
// rateFile: (typeof string) path to driver rates text file
// bonusCount: (typeof number) total bonuses for given driver per month
// driverID: (typeof string)
// month: (typeof number)
// Returns: string formatted as hhh:mm:ss
// ============================================================
function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
let records = readShiftFile(textFile);
    let rates = readRatesFile(rateFile);

    let rateInfo = rates.find(rate => rate.driverID === driverID);
    if (!rateInfo) return "0:00:00";

    let totalRequiredSeconds = 0;

    for (let record of records) {
        let recordMonth = Number(record.date.split("-")[1]);

        if (record.driverID === driverID && recordMonth === month) {
            let weekday = getWeekdayName(record.date);

            if (weekday === rateInfo.dayOff) {
                continue;
            }

            if (isEidPeriod(record.date)) {
                totalRequiredSeconds += 6 * 3600;
            } else {
                totalRequiredSeconds += 8 * 3600 + 24 * 60;
            }
        }
    }

    totalRequiredSeconds -= bonusCount * 2 * 3600;

    if (totalRequiredSeconds < 0) {
        totalRequiredSeconds = 0;
    }

    return formatDuration(totalRequiredSeconds);
}

// ============================================================
// Function 10: getNetPay(driverID, actualHours, requiredHours, rateFile)
// driverID: (typeof string)
// actualHours: (typeof string) formatted as hhh:mm:ss
// requiredHours: (typeof string) formatted as hhh:mm:ss
// rateFile: (typeof string) path to driver rates text file
// Returns: integer (net pay)
// ============================================================
function getNetPay(driverID, actualHours, requiredHours, rateFile) {
let rates = readRatesFile(rateFile);
    let rateInfo = rates.find(rate => rate.driverID === driverID);

    if (!rateInfo) return 0;

    let basePay = rateInfo.basePay;
    let tier = rateInfo.tier;

    let allowedMissingHours = 0;

    if (tier === 1) allowedMissingHours = 50;
    else if (tier === 2) allowedMissingHours = 20;
    else if (tier === 3) allowedMissingHours = 10;
    else if (tier === 4) allowedMissingHours = 3;

    let actualSeconds = parseDuration(actualHours);
    let requiredSeconds = parseDuration(requiredHours);

    if (actualSeconds >= requiredSeconds) {
        return basePay;
    }

    let missingSeconds = requiredSeconds - actualSeconds;
    let remainingAfterAllowance = missingSeconds - (allowedMissingHours * 3600);

    if (remainingAfterAllowance <= 0) {
        return basePay;
    }

    let billableMissingHours = Math.floor(remainingAfterAllowance / 3600);
    let deductionRatePerHour = Math.floor(basePay / 185);
    let salaryDeduction = billableMissingHours * deductionRatePerHour;

    return basePay - salaryDeduction;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
