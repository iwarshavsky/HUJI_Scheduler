function createAgenda(json_in) {

    let container = document.getElementById("agendaContainer");
    container.innerHTML = `<table id="agenda">
  <colgroup>
    <col id="firstCol">
    <col span="6">
  </colgroup>
  <thead>
    <tr>
      <th>Time</th>
      <th>Sunday</th>
      <th>Monday</th>
      <th>Tuesday</th>
      <th>Wednesday</th>
      <th>Thursday</th>
      <th>Friday</th>
    </tr>
  </thead>
  <tbody></tbody>
</table>`;

    function generateTimeSlots(start, end) {
        const slots = [];
        let current = new Date(`1970-01-01T${start}:00`);
        const endTime = new Date(`1970-01-01T${end}:00`);
        while (current <= endTime) {
            slots.push(current.toTimeString().slice(0, 5));
            current.setMinutes(current.getMinutes() + 15);
        }
        return slots;
    }

    const timeSlots = generateTimeSlots("08:00", "19:45");
    const tbody = document.querySelector("#agenda tbody");

    // Initialize empty table and map (time x day)
    const cellMap = {}; // key: `${time}-${day}` = <td>
    const rows = []; // each row is a <tr>

    timeSlots.forEach(time => {
        const tr = document.createElement("tr");

        const timeTd = document.createElement("td");

        timeTd.textContent = time;
        // Don't create TD for :15, :30, :45, they will be "created" when applying the rowspan for the :00
        if (time.endsWith("00")) {
            timeTd.rowSpan = 4;
            tr.appendChild(timeTd);
        }

        for (let day = 0; day < 6; day++) {
            const td = document.createElement("td");
            cellMap[`${time}-${day}`] = td;
            tr.appendChild(td);
        }

        rows.push(tr);
        tbody.appendChild(tr);
    });

    // Fill events with rowspan and tooltips
    function fillEvent(event, course_num, lesson_type, group) {
        const {days, time_start, time_finish, note, places} = event;

        function normalizeTime(time) {
            let [hours, minutes] = time.split(':').map(Number);
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }

        const normalizedStart = normalizeTime(time_start);
        const normalizedEnd = normalizeTime(time_finish);


        const start = new Date(`1970-01-01T${normalizedStart}:00`);
        const end = new Date(`1970-01-01T${normalizedEnd}:00`);
        const minutes = (end - start) / 60000;
        const slotCount = minutes / 15;

        const startTimeStr = time_start.padStart(5, "0");
        const key = `${startTimeStr}-${days}`;
        const td = cellMap[key];
        if (td) {
            td.classList.add("event");
            td.setAttribute("rowspan", slotCount);
            td.textContent = `${course_num} ${lesson_type}`;

            td.title = `Group: ${group}\nPlace: ${places}\nNote: ${note}\n${time_start} - ${time_finish}`;
        }

        // Remove merged cells below
        let t = new Date(start);
        t.setMinutes(t.getMinutes() + 15);
        for (let i = 1; i < slotCount; i++) {
            const timeStr = t.toTimeString().slice(0, 5);
            const skipCell = cellMap[`${timeStr}-${days}`];
            if (skipCell) skipCell.remove();
            t.setMinutes(t.getMinutes() + 15);
        }
    }

    Object.values(json_in.data).forEach(entry => {
        const {course_num, group, lesson_type, event_list} = entry;
        event_list.forEach(event => fillEvent(event, course_num, lesson_type, group));
    });

    let footer = document.querySelector('footer');
    if (data.schedule_next !== -1) {
        let a = document.createElement('a');
        a.href = `${data.schedule_next}`;
        a.textContent = "Next";
        footer.appendChild(a);

    }
    if (data.schedule_prev !== -1) {
        let a = document.createElement('a');
        a.href = `${data.schedule_prev}`;
        a.textContent = "Previous";
        footer.appendChild(a);
    }
}


document.getElementById('getNextBtn_post').addEventListener('click', function () {
    fetch('/get/0', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({"request": 'next'})  // Optional payload
    })
        .then(res => res.json())
        .then(data => {
            console.log('Server response:', data);
            createAgenda(data);
            // You can update the DOM with the response here
        })
        .catch(err =>
            console.error('Error:', err));
});

// document.getElementById('getNextBtn_get').addEventListener('click', function () {
//     sendGetRequest("/get/0");
// });

let addedCourses = [];


function addCourse() {
    const courseNumberInput = document.getElementById("courseNumberInput");
    const yearInput = document.getElementById("year");
    const semesterInput = document.getElementById("semester");

    const courseNumber = courseNumberInput.value.trim();
    const year = yearInput.value.trim();
    const semester = semesterInput.value.trim();

    if (!courseNumber || isNaN(courseNumber) || courseNumber.length > 6) {
        alert("Please enter a valid course number (up to 6 digits).");
        return;
    }

    if (responseStore.has(courseNumber)) {
        alert("Course already added.");
        return;
    }

    sendGetRequest('/get_course', {"year": year, "semester": semester, "id": courseNumber})
        .then(data => {
            if (data) {
                responseStore.add(courseNumber, data);
                updateCourseList();
            } else {
                throw Error("No data")
            }

        })
        .catch(error => {
            alert(error.message);
            console.error('Caught an error:', error.message); // ← Catches your thrown error here
        });

    courseNumberInput.value = "";


}

function removeCourse(courseNumber) {
    responseStore.delete(courseNumber);
    updateCourseList();
}


function updateCourseList() {
    const courseListDiv = document.getElementById("courseList");
    courseListDiv.innerHTML = "";

    Object.keys(responseStore.data).forEach(course => {
        console.log(`Key: ${course}`);
        console.log('Value:', responseStore[course]);
        const wrapper = document.createElement("div");
        wrapper.className = "course-item";

        const label = document.createElement("span");
        label.className = "course-text";

        const icon = document.createElement("span");
        icon.className = "course-icon";

        const number = document.createElement("a");
        number.textContent = course;
        number.onclick = () => openModal(responseStore.data[course]);

        label.appendChild(icon);
        label.appendChild(number);

        const removeBtn = document.createElement("button");
        removeBtn.textContent = "❌";
        removeBtn.onclick = () => removeCourse(course);

        wrapper.appendChild(label);
        wrapper.appendChild(removeBtn);
        courseListDiv.appendChild(wrapper);
    });
}

document.getElementById('requestForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const formData = new FormData(this);
    const jsonData = Object.fromEntries(formData.entries());
    jsonData.courses = responseStore.data
    fetch('/submit', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(jsonData)
    })
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('errorsContainer');
            container.innerHTML = ''; // Clear previous errors

            if (!data.success && data.errors) {
                Object.entries(data.errors).forEach(([key, message]) => {
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'error-message'; // Add styles as needed
                    errorDiv.textContent = `${key}: ${message}`;
                    container.appendChild(errorDiv);
                });
            }
            if (data.success) {

            }
        });
});


const responseStore = {
    data: {},

    add(key, jsonResponse) {
        this.data[key] = jsonResponse;

    },

    get(key) {
        return this.data[key];
    },

    delete(key) {
        if (key in this.data) {
            delete this.data[key];
            return true;  // indicates success
        }
        return false; // key not found
    },
    has(key) {
        return key in this.data;
    }
};

function sendGetRequest(url, params = {}, headers = {}) {
    const queryString = new URLSearchParams(params).toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;

    return fetch(fullUrl, {
        method: 'GET',
        headers: {'Accept': 'application/json', ...headers}
    })
        .then(res => {
            if (!res.ok) {
                throw new Error(`HTTP error ${res.status}`);
            }
            return res.json();
        })

        .catch(error => {
            console.error('Fetch error:', error)
            // throw(error);
        });
}

// Example fetch + store

// Create time options from 00:00 to 16:00 in 15-min intervals
function fillTimeOptions(selectId) {
    const select = document.getElementById(selectId);
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select time";
    select.appendChild(placeholder);

    for (let hour = 0; hour <= 20; hour++) {
        for (let min = 0; min < 60; min += 15) {
            const h = hour.toString().padStart(2, '0');
            const m = min.toString().padStart(2, '0');
            const option = document.createElement("option");
            option.value = `${h}:${m}`;
            option.textContent = `${h}:${m}`;
            select.appendChild(option);
        }
    }
}

const timeFields = [
    "maxDayLength",
    "minDayLength",
    "globalStartTime",
    "dayWithBreakDayLength",
    "dayWithBreakBreakLength"
];
timeFields.forEach(id => fillTimeOptions(id));

function validateForm() {
    const dayLength = document.getElementById("dayWithBreakDayLength").value;
    const breakLength = document.getElementById("dayWithBreakBreakLength").value;
    const onlyOneFilled = (dayLength && !breakLength) || (!dayLength && breakLength);

    if (onlyOneFilled) {
        alert("Please fill in both Day Length and Break Length or leave both empty.");
        return false;
    }
    return true;
}


let workingJson = null;

function openModal(json) {
    workingJson = json; //= JSON.parse(JSON.stringify(json)); // Deep copy
    document.getElementById("jsonModal").style.display = "block";
    renderEditor();
}

function closeModal() {
    document.getElementById("jsonModal").style.display = "none";
    workingJson = null;
}

function renderEditor() {
    const container = document.getElementById("editorContainer");
    container.innerHTML = "";

    if (!workingJson?.pool_dict) {
        container.innerHTML = "<p><strong>pool_dict is missing or deleted.</strong></p>";
        return;
    }

    for (const [type, groups] of Object.entries(workingJson.pool_dict)) {
        const typeDiv = document.createElement("div");
        typeDiv.className = "lesson-type";
        typeDiv.innerHTML = `<strong>${type}</strong>`; //<button onclick="addGroup('${type}')">➕ Add Group</button>

        groups.forEach((group, gIndex) => {
            const groupDiv = document.createElement("div");
            groupDiv.className = "group";

            groupDiv.innerHTML = `
        <div>
          <strong>Group ${group.group}</strong>
          <button onclick="deleteGroup('${type}', ${gIndex})">🗑</button>
          <button onclick="addEvent('${type}', ${gIndex})">➕ Add Event</button>
        </div>
      `;

            group.event_list.forEach((event, eIndex) => {
                const eventDiv = document.createElement("div");
                eventDiv.className = "event";

                for (const [key, value] of Object.entries(event)) {
                    const input = document.createElement("input");
                    input.value = value;
                    input.dataset.type = type;
                    input.dataset.gIndex = gIndex;
                    input.dataset.eIndex = eIndex;
                    input.dataset.key = key;
                    input.oninput = handleEdit;
                    eventDiv.appendChild(input);
                }

                const delBtn = document.createElement("button");
                delBtn.textContent = "❌";
                delBtn.onclick = () => deleteEvent(type, gIndex, eIndex);
                eventDiv.appendChild(delBtn);

                groupDiv.appendChild(eventDiv);
            });

            typeDiv.appendChild(groupDiv);
        });

        container.appendChild(typeDiv);
    }
}

function handleEdit(e) {
    const {type, gIndex, eIndex, key} = e.target.dataset;
    let val = e.target.value;
    if (!isNaN(val)) val = Number(val);
    workingJson.pool_dict[type][gIndex].event_list[eIndex][key] = val;
}

function deleteEvent(type, gIndex, eIndex) {
    workingJson.pool_dict[type][gIndex].event_list.splice(eIndex, 1);
    renderEditor();
}

function deleteGroup(type, gIndex) {
    workingJson.pool_dict[type].splice(gIndex, 1);
    if (workingJson.pool_dict[type].length === 0) delete workingJson.pool_dict[type];
    renderEditor();
}

function deletePoolDict() {
    delete workingJson.pool_dict;
    closeModal();
}

function addEvent(type, gIndex) {
    const defaultEvent = {
        days: 0, time_start: 0, time_finish: 0,
        lesson: type, places: "", note: ""
    };
    workingJson.pool_dict[type][gIndex].event_list.push(defaultEvent);
    renderEditor();
}

function addGroup(type) {
    const defaultGroup = {
        course_num: workingJson.course || "",
        group: "?", semester: workingJson.semester || 0,
        lesson_type: type,
        event_list: []
    };
    workingJson.pool_dict[type].push(defaultGroup);
    renderEditor();
}

// Sample JSON to test