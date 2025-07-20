function addScript(src) {
    return new Promise((resolve, reject) => {

        const s = document.createElement('script');

        s.setAttribute('src', src);
        s.addEventListener('load', resolve);
        s.addEventListener('error', reject);

        document.body.appendChild(s);


    });
}


async function exportStyledTableToExcel(tableId, filename = "table.xlsx") {
    const scripts = ["https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js",
        "https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js"];
    for (const src of scripts) {
        if (document.querySelector(`script[src="${src}"]`) === null) {
            await addScript(src);
        }
    }
    const table = document.getElementById(tableId);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Sheet1", {
  views: [{ rightToLeft: true }]
});

    const rowOffsetMap = {}; // Used to keep track of rowspans
    let currentRow = 1;

    for (let htmlRow of table.rows) {
        const excelRow = worksheet.getRow(currentRow);
        let currentCol = 1;

        for (let cell of htmlRow.cells) {
            // Adjust for previous rowspans
            while (rowOffsetMap[`${currentRow},${currentCol}`]) {
                currentCol++;
            }

            // Get styles
            const style = getCellStyle(cell);

            // Add content and styles
            const excelCell = excelRow.getCell(currentCol);
            excelCell.value = cell.textContent;
            Object.assign(excelCell, style);

            // Handle colspan
            if (cell.colSpan > 1) {
                worksheet.mergeCells(currentRow, currentCol, currentRow, currentCol + cell.colSpan - 1);
            }

            // Handle rowspan
            if (cell.rowSpan > 1) {
                worksheet.mergeCells(currentRow, currentCol, currentRow + cell.rowSpan - 1, currentCol);
                for (let i = 1; i < cell.rowSpan; i++) {
                    rowOffsetMap[`${currentRow + i},${currentCol}`] = true;
                }
            }

            currentCol += cell.colSpan || 1;
        }

        currentRow++;
    }

    worksheet.columns = [
        {width: 8}, // First column wider
        ...Array.from({length: worksheet.columnCount - 1}, () => ({width: 25}))
    ];
    worksheet.eachRow((row) => {
        row.eachCell((cell) => {
            cell.alignment = {
                wrapText: true,
                vertical: 'middle',
                horizontal: 'center' // or 'center', 'right'
            };
        });
    });
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer], {type: "application/octet-stream"}), filename);
    console.log('Saved');
}

function getCellStyle(cell) {
    const cs = window.getComputedStyle(cell);

    return {
        font: {
            bold: cs.fontWeight === "bold" || parseInt(cs.fontWeight) >= 700,
            italic: cs.fontStyle === "italic",
            color: {argb: rgbToArgb(cs.color)},
            name: cs.fontFamily.split(",")[0],
            size: parseInt(cs.fontSize),
        },
        alignment: {
            horizontal: mapTextAlign(cs.textAlign),
            vertical: mapVerticalAlign(cs.verticalAlign),
        },
        fill: {
            type: "pattern",
            pattern: "solid",
            fgColor: {argb: rgbToArgb(cs.backgroundColor)}
        },
        border: {
            top: {style: "thin"},
            left: {style: "thin"},
            bottom: {style: "thin"},
            right: {style: "thin"}
        }
    };
}

function rgbToArgb(rgb) {
    const parts = rgb.match(/\d+/g);
    if (!parts) return "FFFFFFFF";
    return "FF" + parts.map(p => parseInt(p).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function mapTextAlign(align) {
    return {left: "left", right: "right", center: "center", justify: "justify"}[align] || "left";
}

function mapVerticalAlign(align) {
    return {top: "top", middle: "middle", bottom: "bottom"}[align] || "middle";
}



function exportICS() {
    const data = schedules[cur_schedule_id].blocks;

    const daysMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

    function formatTime(date, time) {
        const [hours, minutes] = time.split(':').map(Number);
        date.setHours(hours, minutes, 0);
        return date.toISOString().replace(/[-:]/g, '').split('.')[0];
    }

    function localDateString(date, time) {
        const [h, m] = time.split(':').map(Number);
        const dt = new Date(date);
        dt.setHours(h, m, 0, 0);
        return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(h)}${pad(m)}00`;
    }

    function pad(n) {
        return n < 10 ? '0' + n : n;
    }

    function generateUID(course, event, index) {
        return `${course.course_num}-${event.days}-${event.time_start}-${index}@example.com`;
    }

    // Semester start date (Israel time, adjust as needed)
    const semesterStartDate = new Date('2024-10-20T00:00:00+03:00');

    let icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'PRODID:-//Your School//Course Schedule//EN',
        'BEGIN:VTIMEZONE',
        'TZID:Asia/Jerusalem',
        'X-LIC-LOCATION:Asia/Jerusalem',
        'BEGIN:DAYLIGHT',
        'TZOFFSETFROM:+0200',
        'TZOFFSETTO:+0300',
        'TZNAME:IDT',
        'DTSTART:19700329T020000',
        'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1FR',
        'END:DAYLIGHT',
        'BEGIN:STANDARD',
        'TZOFFSETFROM:+0300',
        'TZOFFSETTO:+0200',
        'TZNAME:IST',
        'DTSTART:19701025T020000',
        'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
        'END:STANDARD',
        'END:VTIMEZONE'
    ];

    data.forEach((course, courseIdx) => {
        course.event_list.forEach((event, i) => {
            let firstEvent = new Date(semesterStartDate);
            while (firstEvent.getDay() !== event.days) {
                firstEvent.setDate(firstEvent.getDate() + 1);
            }

            const dtstart = localDateString(firstEvent, event.time_start);
            const dtend = localDateString(firstEvent, event.time_finish);
            const byDay = daysMap[event.days];

            icsContent.push(
                'BEGIN:VEVENT',
                `UID:${generateUID(course, event, i)}`,
                `SUMMARY:${course.course_name} (${event.lesson})`,
                `DTSTART;TZID=Asia/Jerusalem:${dtstart}`,
                `DTEND;TZID=Asia/Jerusalem:${dtend}`,
                `RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=20250220T235900`,
                `LOCATION:${event.places}`,
                `DESCRIPTION:${event.note}`,
                'END:VEVENT'
            );
        });
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schedule.ics';
    a.click();
    URL.revokeObjectURL(url);
}
