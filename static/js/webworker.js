
class Hour {
    /**
     * Custom hour class which doesn't use dates. Can handle addition.
     * @param val
     */
    constructor(val = 0) {
        if (val instanceof Hour) {
            this.val = val.val;
        } else {
            this.val = val;
        }

    }

    [Symbol.toPrimitive](hint) {
        if (hint === "number" || hint === "default") {
            return this.val;
        }
    }

    valueOf() {
        return this.val;
    }


}

class Schedule {
    static SLOTS = 66;
    static DAYS = 6;
    static BASEHOUR = 8;
    static DayInfo = class {
        /**
         * Info for a single day in the schedule.
         * @param dataArr
         */
        constructor(dataArr) {
            this.start_slot = Schedule.DayInfo.getStartSlot(dataArr);
            this.finish_slot = Schedule.DayInfo.getFinishSlot(dataArr);

            this.start_time = Schedule.convertTime(this.start_slot, "Hour", Schedule.BASEHOUR);
            this.finish_time = Schedule.convertTime(this.finish_slot, "Hour", Schedule.BASEHOUR);

            this.day_length = new Hour(this.finish_time - this.start_time);
            this.free_day = this.day_length == 0;

            const breakLength = Schedule.DayInfo.getLongestBreak(dataArr, this.start_slot, this.finish_slot);
            this.longest_break = Schedule.convertTime(breakLength, "Hour", 0);
        }

        static getStartSlot(arr) {
            /**
             * Return first slot number of day
             */
            for (let i = 0; i < Schedule.SLOTS; i++) {
                if (arr[i]) return i;
            }
            return 0;
        }

        static getFinishSlot(arr) {
            /**
             * Return last slot of day.
             */
            for (let i = Schedule.SLOTS - 1; i >= 0; i--) {
                if (arr[i]) return i;
            }
            return 0;
        }

        static getLongestBreak(arr, start, finish) {
            /**
             * Return longest break of day
             */
            let longest = 0;
            let current = 0;

            for (let i = start; i < finish; i++) {
                if (arr[i]) {
                    if (current > 0) {
                        longest = Math.max(longest, current);
                        current = 0;
                    }
                } else {
                    current++;
                }
            }
            return longest;
        }
    };
    static Properties = class {
        /**
         * Properties of a schedule, grouped together.
         * @param max_day_length
         * @param min_day_length
         * @param num_free_days
         * @param free_days
         * @param max_break_length
         * @param globalStartTime
         * @param day_and_break_lengths
         * @param rest
         */
        constructor({
                        max_day_length = null,
                        min_day_length = null,
                        num_free_days = null,
                        free_days = null,
                        max_break_length = null,
                        globalStartTime = null,
                        day_and_break_lengths = null,
                        ...rest
                    } = {}) {
            this.max_day_length = Schedule.convertTime(max_day_length, "Hour");
            this.min_day_length = Schedule.convertTime(min_day_length, "Hour");
            this.num_free_days = Number(num_free_days);
            if (typeof free_days === "string") {
                if (free_days === "") this.free_days = null;
                else {
                    this.free_days = free_days.split(",").map(value => Number(value));
                }
            } else {
                this.free_days = free_days;
            }
            this.max_break_length = Schedule.convertTime(max_break_length, "Hour");
            this.globalStartTime = Schedule.convertTime(globalStartTime, "Hour");
            this.day_and_break_lengths = day_and_break_lengths;

            // Optional handling for additional keys in rest
            Object.assign(this, rest);
        }
    };
    static Constraint = class extends Schedule.Properties {
        /**
         * Inherits from Schedule.Properties - uses the same fields, but has an extra two: constraints that depend on the
         * properties.
         * @param dayWithBreak_DayLength
         * @param dayWithBreak_BreakLength
         * @param props
         */
        constructor({
                        dayWithBreak_DayLength = null,
                        dayWithBreak_BreakLength = null,
                        ...props
                    } = {}) {
            super(props);
            this.dayWithBreak_DayLength = Schedule.convertTime(dayWithBreak_DayLength, "Hour");
            this.dayWithBreak_BreakLength = Schedule.convertTime(dayWithBreak_BreakLength, "Hour");
        }

        complies(schedule) {
            /**
             * Returns true if the given schedule complies with the user constraints for a schedule.
             * @type {Schedule.Properties}
             */
            const propOther = schedule.get_properties?.();
            if (!propOther) return false;

            if (this.max_day_length && propOther.max_day_length > this.max_day_length) return false;
            if (this.min_day_length && propOther.min_day_length < this.min_day_length) return false;
            if (this.num_free_days && propOther.num_free_days < this.num_free_days) {
                return false;
            }

            if (this.max_break_length && propOther.max_break_length > this.max_break_length) return false;
            if (this.globalStartTime && propOther.globalStartTime < this.globalStartTime) return false;
            if (this.free_days) {
                for (const freeDay of this.free_days) {
                    if (!propOther.free_days.includes(freeDay)) {
                        return false;
                    }
                }
            }
            if (
                this.dayWithBreak_DayLength &&
                this.dayWithBreak_BreakLength &&
                Array.isArray(propOther.day_and_break_lengths?.val)
            ) {
                for (const d of propOther.day_and_break_lengths.val) {
                    if (
                        d.day_length > this.dayWithBreak_DayLength &&
                        d.break_length < this.dayWithBreak_BreakLength
                    ) {
                        return false;
                    }
                }
            }

            return true;
        }
    };

    /**
     * A container for a valid schedule. Has a grid with slots, and a list of course blocks which were successfully added
     * to the grid.
     * @param grid
     * @param blocks
     */
    constructor(grid, blocks) {
        this.grid = grid || Array.from({length: Schedule.DAYS}, () => Array(Schedule.SLOTS).fill(0));
        this.blocks = blocks || [];

    }

    static timeZero() {
        return new Date(2000, 0, 1, 0, 0);
    }

    static convertTime(origin, destType, baseHour = 0) {
        /**
         * Convert origin to new value of destType, taking into account baseHour (for instance, 8 for 8AM)
         */
        // identity case
        if (typeof origin === destType || origin instanceof Hour) {
            return origin;
        }

        if (typeof origin === "string" && origin === "") {
            origin = null;
        }

        // int → string (e.g., 10 → "2:30")
        if (typeof origin === "number" && destType === "string") {
            const hour = Math.floor(origin / 4) + baseHour;
            const minutes = (origin % 4) * 15;
            return `${hour}:${minutes.toString().padStart(2, "0")}`;
        }

        // string → Hour object
        if (typeof origin === "string" && destType === "Hour") {
            if (!origin || !origin.includes(":")) return null;
            const [hourStr, minuteStr] = origin.split(":");
            let diff = (new Date(2000, 0, 1, Number(hourStr), Number(minuteStr))) - Schedule.timeZero(); // arbitrary date
            return new Hour(diff / 1000 / 60 / 60);
        }

        // int → Hour (via int → string → Hour)
        if (typeof origin === "number" && destType === "Hour") {
            const timeString = Schedule.convertTime(origin, "string", baseHour);
            return Schedule.convertTime(timeString, "Hour", baseHour);
        }

        // Hour → string
        if (origin instanceof Hour && destType === "string") {
            const hour = Math.floor(origin);
            const minutes = (origin - hour) * 60;
            return `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
        }

        // string → int
        if (typeof origin === "string" && destType === "number") {
            const [hour, minute] = origin.split(":").map(Number);
            return (hour - baseHour) * 4 + Math.floor(minute / 15);
        }

        // Hour → int (via Hour → string → int)
        if (origin instanceof Hour && destType === "number") {
            const timeString = Schedule.convertTime(origin, "string", baseHour);
            return Schedule.convertTime(timeString, "number", baseHour);
        }

        return null; // fallback
    }

    copy() {
        /**
         * Deep copy both grid and blocks when copying
         * @type {any[][]}
         */
        const gridCopy = this.grid.map(row => [...row]);
        const blocksCopy = this.blocks.map(block => ({...block}));

        return new Schedule(gridCopy, blocksCopy);
    }

    getCell(day, time) {
        return this.grid[day]?.[time];
    }

    setCell(day, time, value) {
        if (!this.grid[day]) this.grid[day] = [];
        this.grid[day][time] = value;
    }

    addBlock(block) {
        /**
         * Attempt to add block to current schedule, return schedule if successful, otherwise return null.
         */
        for (const event of block.event_list) {
            const day = event.days;
            const start = Schedule.convertTime(event.time_start, "number", Schedule.BASEHOUR);
            const end = Schedule.convertTime(event.time_finish, "number", Schedule.BASEHOUR);

            for (let t = start; t < end; t++) {
                if (this.getCell(day, t)) {
                    return null;
                }
                const label = `${block.course_num} ${block.group} ${block.lesson_type}`;
                this.setCell(day, t, label);
            }
        }

        this.blocks.push(block);
        return this;
    }

    getDayInfo(i) {
        /**
         * Generate day info for day i of the week.
         */
        return new Schedule.DayInfo(this.grid[i]);
    }

    get_properties() {
        /**
         * Generate the properties of the weekly schedule (Schedule.Properties).
         * @type {Schedule.DayInfo[]}
         */
        const dayData = Array.from({length: Schedule.DAYS}, (_, i) => this.getDayInfo(i));

        return new Schedule.Properties({
            max_day_length: new Hour(dayData.reduce((max, day) => Math.max(max, day.day_length), 0)),
            min_day_length: new Hour(
                dayData.reduce((min, day) =>
                        !day.free_day ? Math.min(min, day.day_length) : min
                    , Infinity)
            ),
            num_free_days: dayData.reduce((sum, day) => sum + (day.free_day ? 1 : 0), 0),
            free_days: [0, 1, 2, 3, 4, 5].filter(index => dayData[index].free_day), //
            max_break_length: new Hour(dayData.reduce((max, day) => Math.max(max, day.longest_break), 0)),
            globalStartTime: new Hour(dayData.reduce((earliest, day) =>
                (day.start_time < earliest) && !day.free_day ? day.start_time : earliest, Infinity
            )),
            day_and_break_lengths: new Hour(dayData.map(day => ({
                day_length: day.day_length,
                break_length: day.longest_break
            })))
        });
    }
}


function* scheduleGenerator(i, schedule, pools, constraint) {
    /**
     * Generator function for generating valid schedules. Attempts to add blocks. If it fails, it backtracks.
     */
    const n = Object.keys(pools).length;

    if (i >= n) {
        if (constraint.complies(schedule)) {
            yield schedule;
        }
        return;
    }

    for (const block of pools[i]) {
        const newSchedule = schedule.copy().addBlock(block);
        if (newSchedule) {
            yield* scheduleGenerator(i + 1, newSchedule, pools, constraint);
        }
    }


}

let cur_gen = null;

// Communicate with main thread;
onmessage = (e) => {

    console.log("Received");
    // Two types of messages:
    // 1. Continue + amount
    // 2. Start + amount
    const buff_size = e.data['buff_size'] || 10;

    const gen_config = {
        pools: e.data['pools'] || null,
        constraint: new Schedule.Constraint(e.data['constraint_json']) || null
    };
    console.log(self.schedules);
    if (!(gen_config.pools === null || gen_config.constraint === null)) {
        // create generator - reset previous one
        if (cur_gen !== null) {
            cur_gen.return();
            console.log("Canceled");
        }
        cur_gen = scheduleGenerator(0, new Schedule(), gen_config.pools, gen_config.constraint);

    }

    let schedules_buff = []
    let i = 1;
    let sent_count = 0;
    for (const sched of cur_gen) {

        schedules_buff.push(sched);
        if (i % buff_size === 0) {
            postMessage({schedules: schedules_buff, done: false, first: sent_count === 0});
            sent_count++;
            schedules_buff = [];
        }
        i++;
    }
    postMessage({schedules: schedules_buff, done: true, first: sent_count === 0});
    sent_count++;

};


