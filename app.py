import os
import pickle
import re
import sqlite3
import uuid

from flask import (Flask, request, session, flash, g, send_from_directory, redirect, url_for, Response,
                   stream_with_context, jsonify, render_template, send_file, abort)

import schedule_generator
from schedule_generator import *
from datetime import datetime
from io import BytesIO
from db import *

app = Flask(__name__)
app.config.from_mapping(
    SECRET_KEY='dev',
    JSON_AS_ASCII=False
)


def pickle_write(filename, generator):
    """
    Store pointer to index array at start of file.
    Adds the file to database
    https://stackoverflow.com/questions/5580201/seek-into-a-file-full-of-pickled-objects
    :param filename:
    :param generator:
    :return: Number of objects added
    """
    index = []
    with open(filename, mode="wb") as pickle_file:
        pickle_file.write(struct.pack('L', 0))  # write a long of zeroes
        for s in generator:
            index.append(pickle_file.tell())
            pickle.dump(s, pickle_file)
        index_loc = pickle_file.tell()
        pickle.dump(index, pickle_file)
        pickle_file.seek(0, 0)
        pickle_file.write(struct.pack('L', index_loc))
    return len(index)



def pickle_read(filename, ids):
    """
    Return array of deserialized pickle objects with given ids
    :param filename:
    :param ids:
    :return:
    """
    items = []

    with open(filename, mode="rb") as f:
        size = struct.calcsize('L')
        raw_bytes = f.read(size)
        index_loc = struct.unpack('L', raw_bytes)[0]
        f.seek(index_loc)
        index_array = pickle.load(f)
        for i in ids:
            c = index_array[i]
            f.seek(c)
            items.append(pickle.load(f))
    return items


# @app.errorhandler(401)
# def custom_401(error):
#     return Response('<Why access is denied string goes here...>', 401, {'WWW-Authenticate':'Basic realm="Login Required"'})

def session_required(func):
    def wrapper(*args, **kwargs):
        if 'uuid' not in session:
            abort(400)
        return func(*args, **kwargs)

    wrapper.__name__ = func.__name__
    return wrapper


@app.route('/', methods=['GET', 'POST'])
def home():
    init_db()
    get_db()
    session.clear()
    session['uuid'] = uuid.uuid4().hex
    # CLEAN OLD FILES
    return render_template('form.html')


@app.route('/get_course', methods=['GET', 'POST'])
@session_required
def get_course():
    errors = {}
    data = {}
    if 'year' not in request.args:
        errors['year'] = 'Year is required.'
    else:
        year = request.args['year']
        if not (2024 <= int(year) <= datetime.now().year):
            errors['year'] = "Invalid year"
        data['year'] = year
    if 'semester' not in request.args:
        errors['semester'] = 'Semester is required.'
    else:
        if request.args['semester'] not in ["A", "B"]:
            errors['semester'] = 'Semester must be A or B'
        else:
            data['semester'] = 0 if request.args['semester'] == "A" else 1
    if 'id' not in request.args:
        errors['id'] = 'Course ID is required'
    else:
        data['id'] = request.args['id']
    if errors:
        return Response(response=errors, status=400)
    # CACHE!
    course = Course(data['id'], data['year'], data['semester'])
    if course.pool_dict:
        return Response(response=json.dumps(course, default=vars),
                        status=200,
                        mimetype='application/json')
    return Response(response=json.dumps({"error":"No such course exists"}), status=400)

@app.teardown_appcontext
def close_connection(exception):
    close_db()

@app.route('/submit', methods=['POST'])
@session_required
def submit():
    def is_valid_custom_time(s):
        pattern = r'^(?:[01]\d|2[0-4]):(?:00|15|30|45)$'
        return bool(re.fullmatch(pattern, s))


    data = request.get_json()
    errors = {}

    if not data.get('courses'):
        errors['courses'] = 'Courses are required'
    else:
        data['courses'] = data.get('courses')

        # TODO check number of courses

    for k in ["max_day_length", "min_day_length", "global_start_time", "dayWithBreak_BreakLength", "break_length"]:
        if data.get(k) and not is_valid_custom_time(data.get(k)):
            errors[k] = f"{k} is not a valid time"

    if errors:
        return jsonify({'success': False, 'errors': errors})

    # No errors — proceed with logic
    session["form_args"] = data

    # Generate Pickles in single file
    # with open("d", mode="wb") as f:
    #     pickle.dump(data,f)
    # print(data)
    num_objects = pickle_write(session['uuid'], scheduleGenerator(data))

    query_db("INSERT into sessions (uuid,num_objects,filename,last_accessed) values (?,?,?,strftime('%s','now'))",
             [session['uuid'], num_objects, session['uuid'], ])

    if num_objects > 0:
        return get(0)
    return jsonify({'message':"No results"})
        # return jsonify({'count': num_objects, 'message': 'Task saved!'})

    # TODO make sure all fields exist
    # session["year"]           = request.form.get('year')
    # session["semester"]       = request.form.get('semester')
    # session["course_numbers"] = request.form.get('courseNumbers')  # comma-separated string
    # session["max_day_length"] = request.form.get('max_day_length')
    # session["min_day_length"] = request.form.get('min_day_length')
    # session["min_free_days"]  = request.form.get('min_free_days')
    # session["global_start_time"] = request.form.get('globalStartTime')
    # session["dayWithBreak_DayLength"] = request.form.get('dayWithBreak_DayLength')
    # session["break_length"] = request.form.get('dayWithBreak_BreakLength')



# a simple page that says hello
@app.route('/get/<schedule_id>', methods=['GET','POST'])
@session_required
def get(schedule_id):
    if session.get("form_args"):
        session_id = session['uuid']
        filename, num_schedules = query_db("SELECT filename, num_objects FROM sessions WHERE uuid = ?", [session_id], one=True)
        if int(num_schedules) >= 0 and 0<=int(schedule_id) < int(num_schedules) and filename:
            # if request.method == 'POST':
            #     return jsonify({"response":"OK"})
            schedule = pickle_read(filename, [int(schedule_id)])[0]
            if schedule:
                response_dict = {"schedule_id": schedule_id,
                                 "schedule_total": num_schedules,
                                 "schedule_next": int(schedule_id) + 1 if int(schedule_id) + 1 < int(num_schedules) else -1,
                                 "schedule_prev": int(schedule_id) - 1 if (int(schedule_id) - 1 >= 0) else -1,
                                 "data": schedule.to_dict()}
                if request.method == 'POST':  # Return JSON

                    # schedule_dict =
                    # schedule_dict["count"] = num_schedules
                    # schedule_dict["id"] = schedule_id
                    return jsonify(response_dict)
                    # return Response(response=schedule.to_dict(), status=200)
                    # return jsonify(schedule.to_dict())
                else:                         # Download file
                    return render_template("agenda.html", schedule_data=response_dict)
                    # return send_file(schedule.to_excel(), download_name="schedule.xlsx", mimetype='application/octet-stream', as_attachment=True)
        else:
            abort(400, description="No file associated with session")

    return "", 400


@app.route('/download/<file_id>')
@session_required
def download(file_id):
    return send_file(BytesIO(), download_name="schedule.xlsx", as_attachment=True)


if __name__ == '__main__':
    app.run()
# host='127.0.0.1', port=5001, debug=True
