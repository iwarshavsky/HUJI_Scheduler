import uuid

from flask import (Flask, request, session, flash, g, send_from_directory, redirect, url_for, Response,
                   stream_with_context, jsonify, render_template, send_file, abort)

from schedule_generator import *
from datetime import datetime, date
from db import *

app = Flask(__name__)
app.config.from_mapping(
    SECRET_KEY='dev',
    JSON_AS_ASCII=False
)


def get_current_year():
    def has_one_day_passed(sqlite_date_str):
        # Convert 'YYYY-MM-DD' string to date
        sqlite_date = datetime.strptime(sqlite_date_str, "%Y-%m-%d").date()

        # Get today's date
        today = date.today()

        # Calculate difference in days
        delta = (today - sqlite_date).days

        return delta >= 1

    db_response = query_db(
        "SELECT year, date_created FROM course_cache WHERE course_num = 0 and semester = 0", one=True)
    if db_response:
        cached_year, date_created = db_response

        # Check date
        if has_one_day_passed(date_created):
            year = requestCurrentYear()
            query_db(
                "UPDATE course_cache SET year = ?, date_created = DATE('now') WHERE course_num=0 and  semester = 0",
                [year], one=True)
            return year
        return cached_year

    current_year = requestCurrentYear()
    query_db("INSERT INTO course_cache (course_num, year, semester, data, date_created) values (0,?,0,'',DATE('now'))",
             [current_year], one=True)
    return current_year


@app.route('/', methods=['GET', 'POST'])
def home():
    init_db()
    get_db()
    session.clear()
    session['uuid'] = uuid.uuid4().hex
    # CLEAN OLD FILES
    return render_template('form.html', current_year=get_current_year())


@app.route('/get_course', methods=['GET', 'POST'])
# @session_required
def get_course():
    errors = {}
    data = {}
    if 'year' not in request.args:
        errors['year'] = 'Year is required.'
    else:
        year = request.args['year']

        # Check if year is allowed

        if int(year) != get_current_year():
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
    cached_response = None
    db_response = query_db(
        "SELECT data, date_created FROM course_cache WHERE course_num = ? and year = ? and semester = ?",
        [data['id'], data['year'], data['semester']], one=True)

    if db_response:
        cached_response, date_created = db_response

    if cached_response:
        return Response(response=cached_response,
                        status=200,
                        mimetype='application/json')

    course = Course(data['id'], data['year'], data['semester'])
    data_to_add = json.dumps(course if course.pool_dict else {"error": "No such course exists"}, default=vars)
    # DELETE OLD CACHED
    query_db("DELETE FROM course_cache WHERE date_created < DATE('now','-1 month')")
    query_db(
        "INSERT INTO course_cache (course_num, year, semester, data, date_created) values (?,?,?,?,DATE('now'))",
        [data['id'], data['year'], data['semester'], data_to_add], one=True)
    return Response(response=data_to_add,
                    status=200,
                    mimetype='application/json')


@app.teardown_appcontext
def close_connection(exception):
    print(exception)
    close_db()
