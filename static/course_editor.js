const dayMap = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "שבת"];

    // Put your full JSON string here

    function renderForm() {
      const container = document.getElementById("editorContainer");
      container.innerHTML = "";
        container.innerHTML += `
        <div class="edit_course_title">
        <h3>${workingJson.course_num} - ${workingJson.course_name}</h3>
        <a href="${workingJson.url}" target="_blank">קישור לשנתון</a>
        </div>
        `;
      // For each top-level key (e.g. שעור, תרג)
      Object.keys(workingJson.pool_dict).forEach(sectionName => {
        // Create a container for this section
        const sectionDiv = document.createElement("div");
        sectionDiv.className = "modal-section-container";

        // Add section title once
        const sectionTitle = document.createElement("h2");
        sectionTitle.textContent = sectionName;
        sectionDiv.appendChild(sectionTitle);

        // Group entries by 'group' inside this section
        const grouped = {};
        workingJson.pool_dict[sectionName].forEach(entry => {
          if (!grouped[entry.group]) grouped[entry.group] = [];
          grouped[entry.group].push(entry);
        });

        // For each group, create a table inside the section container
        Object.entries(grouped).forEach(([groupId, groupEntries]) => {
          const groupDiv = document.createElement("div");
          groupDiv.className = "modal-group-container";

          const groupTitle = document.createElement("h3");
          groupTitle.textContent = `קבוצה ${groupId}`;
          groupDiv.appendChild(groupTitle);

          groupEntries.forEach((group) => {
            const table = document.createElement("table");
            table.classList.add("table-modal");
            const thead = document.createElement("thead");
            thead.innerHTML = `
              <tr>
                <th>יום</th>
                <th>שעת התחלה</th>
                <th>שעת סיום</th>
                <th>סוג מפגש</th>
                <th>מיקום</th>
                <th>הערות</th>
                <th></th>
              </tr>`;
            table.appendChild(thead);

            const tbody = document.createElement("tbody");

            group.event_list.forEach((event, eventIndex) => {
              const row = document.createElement("tr");

              // Day select dropdown
              const daySelect = document.createElement("select");
              dayMap.forEach((day, i) => {
                const option = document.createElement("option");
                option.value = i;
                option.textContent = day;
                if (i === event.days) option.selected = true;
                daySelect.appendChild(option);
              });
              daySelect.onchange = (e) => {
                event.days = parseInt(e.target.value);
              };

              row.appendChild(createCell(daySelect));
              row.appendChild(createCell(createInput(event.time_start, "time_start", event)));
              row.appendChild(createCell(createInput(event.time_finish, "time_finish", event)));
              row.appendChild(createCell(createInput(event.lesson, "lesson", event)));
              row.appendChild(createCell(createInput(event.places, "places", event)));
              row.appendChild(createCell(createInput(event.note, "note", event)));

              // Delete row button
              const delRowBtn = document.createElement("button");
              delRowBtn.textContent = "מחיקה";
              delRowBtn.onclick = () => {
                group.event_list.splice(eventIndex, 1);
                workingJson.edited = true;
                renderForm();
              };
              row.appendChild(createCell(delRowBtn));

              tbody.appendChild(row);
            });

            table.appendChild(tbody);
            groupDiv.appendChild(table);

            // Add row button
            const addRowBtn = document.createElement("button");
            addRowBtn.textContent = "הוספת שורה";
            addRowBtn.onclick = () => {
              group.event_list.push({
                days: 0,
                time_start: "",
                time_finish: "",
                lesson: sectionName,
                places: "",
                note: ""
              });
              workingJson.edited = true;
              renderForm();
            };
            groupDiv.appendChild(addRowBtn);
          });

          // Delete group button
          const delGroupBtn = document.createElement("button");
          delGroupBtn.textContent = `מחיקת קבוצה ${groupId}`;
          delGroupBtn.onclick = () => {
            workingJson.pool_dict[sectionName] = workingJson.pool_dict[sectionName].filter(g => g.group !== groupId);
            workingJson.edited = true;
            renderForm();
          };
          groupDiv.appendChild(delGroupBtn);

          sectionDiv.appendChild(groupDiv);
        });

        // Add new group button for the section
        const addGroupBtn = document.createElement("button");
        addGroupBtn.textContent = `הוספת קבוצה ל-${sectionName}`;
        addGroupBtn.onclick = () => {
          const newGroupId = prompt("הכניסו מזהה לקבוצה (א, ב, ג, ...):", "");
          if (!newGroupId) return;
          workingJson.pool_dict[sectionName].push({
            course_num: workingJson.course_num,
            course_name: workingJson.course_name,
            warnings: [],
            group: newGroupId,
            semester: 0,
            event_list: [],
            lesson_type: sectionName
          });
          workingJson.edited = true;
          renderForm();
        };
        sectionDiv.appendChild(addGroupBtn);

        container.appendChild(sectionDiv);
      });
    }

    function createCell(child) {
      const td = document.createElement("td");
      td.appendChild(child);
      return td;
    }

    function createInput(value, field, event) {
      const input = document.createElement("input");
      input.value = value;
      input.onchange = (e) => {
        let val = e.target.value;
        if (!isNaN(val)) val = Number(val);
        if (val !== event[field]) workingJson.edited = true;
        event[field] = e.target.value;
      };
      return input;
    }


    // function applyChanges() {
    //   // Apply workingJson.pool_dict to original workingJson.pool_dict object directly
    //   Object.keys(workingJson.pool_dict).forEach(key => delete workingJson.pool_dict[key]);
    //   Object.assign(workingJson.pool_dict, JSON.parse(JSON.stringify(workingJson.pool_dict)));
    //   alert("Changes applied to original object.");
    // }

