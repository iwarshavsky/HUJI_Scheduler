let schedules = [];
let cur_schedule_id = null;
function createAgenda(schedule_id, msg="") {

    let container = document.getElementById("agendaContainer");

    if (typeof schedule_id === "string") {
        schedule_id = Number(schedule_id) - 1;
    }
    cur_schedule_id = schedule_id;
    // if (schedule_id < 0) {
    //     container.innerHTML = "";
    //     return;
    // }

    container.innerHTML = `<table id="agenda">
  <colgroup>
<col>
  <col style="width:16%">
  <col style="width:16%">
  <col style="width:16%">
  <col style="width:16%">
  <col style="width:16%">
  <col style="width:16%">
  </colgroup>
  <thead>
    <tr>
      <th></th>
      <th>ראשון</th>
      <th>שני</th>
      <th>שלישי</th>
      <th>רביעי</th>
      <th>חמישי</th>
      <th>שישי</th>
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
    msg_div.innerText = msg;
    if (schedule_id < 0) {
        document.querySelector("footer").classList.add("hidden");
        // Show the message
        const msg_div = document.getElementById("msg_div");

        msg_div.classList.add("show");
        return;
    }
    document.querySelector("footer").classList.remove("hidden");
    // Fill events with rowspan and tooltips
    function fillEvent(event, course_num, course_name, lesson_type, group, color) {
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
            td.style.background = responseStore.get(course_num).color;
            td.textContent = `${course_name}\n${lesson_type}`;

            td.title = `קבוצה: ${group}
מיקום: ${places}
הערה: ${note}
            ${time_start} - ${time_finish}`;
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

    Object.values(schedules[schedule_id].blocks).forEach(entry => {
        const {course_num, course_name, group, lesson_type, event_list} = entry;
        event_list.forEach(event => fillEvent(event, course_num, course_name, lesson_type, group));
    });



    let button_prev = document.getElementById("agenda_prev");
    button_prev.onclick = () => {
        createAgenda(schedule_id - 1)
    };
    button_prev.disabled = 0 >= schedule_id;

    let num_h = document.getElementById("cur_schedule_number");
    num_h.textContent = `${schedule_id + 1}`;
    // num_h.id = "schedule_number";

    let button_next = document.getElementById("agenda_next");
    button_next.onclick = () => {
        createAgenda(schedule_id + 1)
    };

    button_next.disabled = schedule_id >= schedules.length - 1;

}



let addedCourses = [];


function addCourse() {
    const courseNumberInput = document.getElementById("courseNumberInput");
    const yearInput = document.getElementById("year");
    const semesterInput = document.querySelector('input[name="semester"]:checked');

    const courseNumber = courseNumberInput.value.trim();
    const year = yearInput.value.trim();
    const semester = semesterInput.value.replace("Semester"," ").trim();

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
            if (!data.error) {
                responseStore.add(courseNumber, data);
                updateCourseList();
            } else {
                throw Error("הקורס לא קיים")
            }

        })
        .catch(error => {
            alert(error.message);
            // console.error('Caught an error:', error.message); // ← Catches your thrown error here
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
        // console.log(`Key: ${course}`);
        // console.log('Value:', responseStore[course]);
        const wrapper = document.createElement("div");
        wrapper.className = "course-item";

        const label = document.createElement("span");
        label.className = "course-text";

        const icon = document.createElement("span");
        icon.className = "course-icon";
        icon.style.background = responseStore.get(course).color;
        icon.onclick = (e) => {
            e.stopPropagation();
            showColorWheel(e, (returnedColor) => {
                responseStore.get(course).color = returnedColor;
                icon.style.background = returnedColor;
            })
          };

        const number = document.createElement("a");
        number.textContent = `${responseStore.get(course).course_num}: ${responseStore.get(course).course_name}`;
        number.onclick = () => openModal(responseStore.data[course]);

        label.appendChild(icon);
        label.appendChild(number);



        const removeBtn = document.createElement("button");
        removeBtn.textContent = "❌";
        removeBtn.onclick = () => removeCourse(course);

        wrapper.appendChild(label);
        if (responseStore.get(course)?.edited) {
            const edited = document.createElement("span");
            edited.textContent = "✏️";
            wrapper.append(edited);
        }
        wrapper.appendChild(removeBtn);
        courseListDiv.appendChild(wrapper);
    });
}




const responseStore = {
    data: {},

    add(key, jsonResponse) {
        this.data[key] = jsonResponse;
        let existing_colors = Object.values(this.data).map(x => x.color);
        this.data[key].color = colors.filter(c => !existing_colors.includes(c))[0] || '';
        // Get unused color
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
    placeholder.textContent = "בחרו";
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
    const courseNumber = document.getElementById("courseNumberInput").value;
    const minFreeDays = document.getElementById("minFreeDays").value;
    if (onlyOneFilled) {
        alert("Please fill in both Day Length and Break Length or leave both empty.");
        return false;
    }
    // if (!/^\d{4,7}$/.test(String(courseNumber))) { // only numbers with 4 to 7 digits allowed
    //     alert("יש לבחור מספר קורס בין 4 ל-7 ספרות");
    //     return false;
    // }
    if (Object.keys(responseStore.data).length === 0) {
        alert("יש לבחור קורס");
        return false;
    }
    if (!/^$|^[0-6]$/.test(minFreeDays)) {
        alert("מספר ימים מינילי יכול להיות רק בין 0-6");
        return false;
    }  // single digit between 0-6 or empty allowed


    return true;
}


let workingJson = null;


document.getElementById("jsonModal").addEventListener("click", function(e) {
  if (e.target === this) {
    // Only close if the background itself was clicked
    closeModal();
  }
});
// function handleClickModal(e) {
//   if (e.target.id !== "modal-content") {
//     closeModal();
//   }
// }
function openModal(json) {
    workingJson = json; //= JSON.parse(JSON.stringify(json)); // Deep copy
    document.getElementById("jsonModal").style.display = "flex";
    // setTimeout(() => {
    //   document.addEventListener("click", handleClickModal);
    // }, 0);
    // document.addEventListener("click",handleClickModal);
    renderForm();
}

function closeModal() {
    document.getElementById("jsonModal").style.display = "none";
    workingJson = null;
    updateCourseList();
}

document.getElementById('requestForm').addEventListener("keydown", function (key) {
    let btn = 0 || key.keyCode || key.charCode;
    if (btn === 13) {
        key.preventDefault();
    }
});


    const colors = [
      "#ff4f00", "#ffffff", "#536ff5", "#1cc21c", "#e5e50a", "#c91313", "#ff00ff", "#00ffff", ""
    ];

    const colorWheel = document.getElementById("colorWheel");
    const colorButton = document.getElementById("colorButton");

    function showColorWheel(e, callback) {
      colorWheel.innerHTML = ""; // clear previous dots
      const numColors = colors.length;

      // Dynamically calculate radius based on number of colors
      const minRadius = 40;
      const maxRadius = 80;
      const radius = Math.max(minRadius, Math.min(maxRadius, numColors * 6));

      let x = e.clientX;
      let y = e.clientY;
      // console.log(x,y);

      // Calculate the full dimensions of the color wheel
      const diameter = radius * 2 + 30; // +30 for dot size and spacing

      // Clamp position to keep the wheel fully within viewport
      const padding = 10;
      // x = Math.max(padding + diameter / 2, Math.min(window.innerWidth - diameter / 2 - padding, x));
      // y = Math.max(padding + diameter / 2, Math.min(window.innerHeight - diameter / 2 - padding, y));

      colorWheel.style.left = `${x}px`;
      colorWheel.style.top = `${y}px`;
      colorWheel.style.transform = "translate(-50%, -50%)";
      colorWheel.style.position = "fixed";
      colorWheel.style.display = "block";

      const centerX = 0;
      const centerY = 0;

      colors.forEach((color, i) => {
        const angle = (2 * Math.PI / numColors) * i;
        const dotX = centerX + radius * Math.cos(angle) - 15;
        const dotY = centerY + radius * Math.sin(angle) - 15;

        const dot = document.createElement("div");
        dot.className = "color-dot";
        dot.style.backgroundColor = color;
        dot.style.left = `${dotX}px`;
        dot.style.top = `${dotY}px`;

        dot.addEventListener("click", () => {
          callback(color);
        });

        colorWheel.appendChild(dot);
      });
    }

    document.addEventListener('click', (e) => {
      colorWheel.style.display = "none";
    });
// Sample JSON to test
// const validSchedules = [];
const schedule_worker = new Worker("/static/js/webworker.js");
const form_results_num = document.getElementById("schedule_total");
schedule_worker.onmessage = (event) => {
  const is_first = event.data.first;
  const is_done = event.data.done;
  if (is_first) schedules = [];
    schedules = schedules.concat(event.data.schedules);
    if (is_first) {
        if (schedules.length > 0) {
            createAgenda(0);
            console.log("This is the first");
        }
        else {
            createAgenda(-1,"אין תוצאות :(");
            console.log("No results");
        }
    } else {
        console.log("After first")
    }

    if (is_done) {
        console.log("Is done");
    }
    form_results_num.innerText = `/${schedules.length}`;
  // console.log(`Got: ${event.data}`);
};

schedule_worker.onerror = (error) => {
  console.log(`Worker error: ${error.message}`);
  throw error;
};



document.getElementById('requestForm').addEventListener('submit', function (e) {
    e.preventDefault();

  document.getElementById("free_days").value = [...document.querySelectorAll('input[name="freeDay"]:checked')]
      .map(cb => cb.value)
      .join(",");


    const formData = new FormData(this);

    const constraint_jsonData = Object.fromEntries(formData.entries());


    let _pools = [];
    for (const courseId in responseStore.data) { // key == course
        const courseData = responseStore.data[courseId];
        for (const poolId in courseData['pool_dict']) {
            _pools.push(courseData['pool_dict'][poolId]);
        }
    }
    schedules = [];

    schedule_worker.postMessage({pools: _pools, constraint_json: constraint_jsonData, buff_size: 5});
    // createAgenda(-1);
    // for (const sched of scheduleGenerator(0, new Schedule(), _pools, constraint)) {
    //     validSchedules.push(sched);
    // }
    // TODO: webworker
    // schedules = validSchedules;
    // if (validSchedules.length > 0) {
    //     createAgenda(0);
    // } else {
    //     createAgenda(-1);
    // }
    // A non colliding schedule will include one element from each index of pool_arr
    // with no collisions
    // console.log(validSchedules);
});

let cur_number_el = document.getElementById("cur_schedule_number");
let course_number_input = document.getElementById("courseNumberInput");

cur_number_el.onkeydown = (e) => {
      if (
    e.key === "Enter"
  ) {
    e.preventDefault(); // Prevent line break
          const cur_val = cur_number_el.innerText.trim();
          // Send it as a string, createAgenda won't add 1 to it.
          cur_number_el.innerText = "";
    createAgenda(cur_val);
    return;
  }

  const allowedKeys = [
    "Backspace", "Delete", "ArrowLeft", "ArrowRight", "Tab",
    "Home", "End"
  ];

  if (allowedKeys.includes(e.key)) return;

  // Allow digits only
  if (!/^\d$/.test(e.key)) {
    e.preventDefault();
  }
}

course_number_input.onkeydown = (e) => {
  if (
    e.key === "Enter"
  ) {
    e.preventDefault(); // Prevent line break
          // const cur_val = cur_number_el.innerText.trim();
          // // Send it as a string, createAgenda won't add 1 to it.
          // cur_number_el.innerText = "";
    addCourse();
    // return;
  }
}

// document.getElementById('requestForm').addEventListener('submit', function (e) {
//     e.preventDefault();
//
//     const formData = new FormData(this);
//     const jsonData = Object.fromEntries(formData.entries());
//     jsonData.courses = responseStore.data
//     fetch('/submit', {
//         method: 'POST',
//         headers: {'Content-Type': 'application/json'},
//         body: JSON.stringify(jsonData)
//     })
//         .then(res => res.json())
//         .then(data => {
//             const container = document.getElementById('errorsContainer');
//             container.innerHTML = ''; // Clear previous errors
//
//             if (!data.success && data.errors) {
//                 Object.entries(data.errors).forEach(([key, message]) => {
//                     const errorDiv = document.createElement('div');
//                     errorDiv.className = 'error-message'; // Add styles as needed
//                     errorDiv.textContent = `${key}: ${message}`;
//                     container.appendChild(errorDiv);
//                 });
//             }
//             if (data.success) {
//
//             }
//         });
// });