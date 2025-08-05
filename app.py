import json
import uuid
import re
from flask import (Flask, request, session, flash, g, send_from_directory, redirect, url_for, Response,
                   stream_with_context, jsonify, render_template, send_file, abort)
from flask_mail import Mail, Message

from schedule_generator import *
from datetime import datetime, date, timezone
from db import *

app = Flask(__name__)

# configuration of mail
app.config['MAIL_SERVER'] = os.environ["EMAIL_SERVER"]
app.config['MAIL_PORT'] = os.environ["EMAIL_PORT"]
app.config['MAIL_USERNAME'] = os.environ["EMAIL_ADDRESS"]
app.config['MAIL_PASSWORD'] = os.environ["EMAIL_PWD"]
app.config['MAIL_USE_TLS'] = os.environ["EMAIL_USE_TLS"]
app.config['MAIL_USE_SSL'] = os.environ["EMAIL_USE_SSL"]
mail = Mail(app)

app.config.from_mapping(
    SECRET_KEY=os.getenv("KEY"),
    JSON_AS_ASCII=False
)


def is_too_old(stored_date):
    """
    Determine whether a cached item is too old.
    """
    delta = (datetime.now(timezone.utc) - stored_date).days
    return delta >= 1


def get_current_year():
    """
    Return current scheduling year, get from cache if possible.
    """
    db_response = query_db(
        "SELECT year, date_created FROM course_cache WHERE course_num = 0 and semester = 0", one=True)
    if db_response:
        cached_year, date_created = db_response

        # Check date
        if is_too_old(date_created):
            year = requestCurrentYear()
            query_db(
                "UPDATE course_cache SET year = %s, date_created = now() WHERE course_num=0 and  semester = 0",
                [year], one=True)
            return year
        return cached_year

    current_year = requestCurrentYear()
    query_db("INSERT INTO course_cache (course_num, year, semester, data, date_created) values (0,%s,0,'',now())",
             [current_year], one=True)
    return current_year


def session_required(func):
    """
    Decorator for enforcing requirement for session to access a server resource
    """
    def wrapper(*args, **kwargs):
        if 'uuid' not in session:
            abort(400)
        return func(*args, **kwargs)

    wrapper.__name__ = func.__name__
    return wrapper


@app.route('/', methods=['GET'])
def home():
    """
    Main page
    :return:
    """
    get_db()
    session.clear()
    session['uuid'] = uuid.uuid4().hex
    log(from_server_function=True, passed_kwargs={"action": "entered", "result": "", "config": {}})
    return render_template('form.html', current_year=get_current_year())


@app.route('/get_course', methods=['GET'])
@session_required
def get_course():
    """
    Get a course from a specific year, semester and with the given id. Load it from cache if it exists.
    :return:
    """
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
    date_created = None
    db_response = query_db(
        "SELECT data, date_created FROM course_cache WHERE course_num = %s and year = %s and semester = %s",
        [data['id'], data['year'], data['semester']], one=True)

    if db_response:
        cached_response, date_created = db_response

    if cached_response and not is_too_old(date_created):
        log(from_server_function=True, passed_kwargs={"action": "get_course", "result": "Cached response",
                                                      "config": {"course_num": data['id'], "year": data['year'],
                                                                 "semester": data['semester']}})
        return Response(response=cached_response,
                        status=200,
                        mimetype='application/json')

    course = Course(data['id'], data['year'], data['semester'])
    data_to_add = json.dumps(course if course.pool_dict else {"error": "bad course"}, default=vars)

    if cached_response:
        query_db("UPDATE course_cache SET date_created = now(), data = %s WHERE semester = %s and year = %s and course_num = %s",
                 [data_to_add, data['semester'], data['year'], data['id']])

    # query_db("DELETE FROM course_cache WHERE date_created < now() - INTERVAL '1 DAY'")
    else:
        query_db(
            "INSERT INTO course_cache (course_num, year, semester, data, date_created) values (%s,%s,%s,%s,now())",
            [data['id'], data['year'], data['semester'], data_to_add], one=True)
    log(from_server_function=True, passed_kwargs={"action": "get_course", "result": "Extracted course",
                                                  "config": {"course_num": data['id'], "year": data['year'],
                                                             "semester": data['semester']}})
    return Response(response=data_to_add,
                    status=200,
                    mimetype='application/json')


@app.teardown_appcontext
def close_connection(exception):
    """
    Handle unexpected termination of connection
    """
    print(exception)
    close_db()


@app.route('/contact', methods=['POST'])
@session_required
def contact():
    """
    Send me an email.
    """
    email_regex = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b'
    if re.fullmatch(email_regex, request.form["contact_email"]):
        msg = Message(
            f'HUJI Scheduler - message from {request.form["contact_name"]}',
            sender=os.getenv("EMAIL_ADDRESS"),
            recipients=[os.getenv("EMAIL_ADDRESS")]
        )
        msg.reply_to = request.form["contact_email"]
        msg.body = request.form["contact_message"]
        mail.send(msg)
        return 'Sent'
    abort(400)


@app.route('/', methods=['POST'])
@session_required
def log(from_server_function=False, passed_kwargs=None):
    """
    Log user actions for debugging purposes only
    """
    if from_server_function:
        action = passed_kwargs['action']
        result = passed_kwargs['result']
        config = passed_kwargs['config']
    else:
        data = request.json
        action = data.get('action') or ""
        result = data.get('result') or ""
        config = data.get('config') or ""

    ip_address = ""
    if request.environ.get('HTTP_X_FORWARDED_FOR') is None:
        ip_address = request.environ['REMOTE_ADDR']
    else:
        ip_address = request.environ['HTTP_X_FORWARDED_FOR']  # if behind a proxy

    query_db(
        "INSERT INTO stats (uuid, timestamp, action, result, config, ip_address) values (%s, now(), %s, %s, %s, %s)",
        [session['uuid'], action, json.dumps(result), json.dumps(config), ip_address])
    return '', 200


# Catch ALL errors (HTTP and internal exceptions)
@app.errorhandler(Exception)
def handle_all_errors(e):
    """
    Generic error page
    """

    return """
    <!doctype html>
    <html>
    <head><title>Error</title></head>
    <body>
        <h1>Oops! Something went wrong.</h1>
        <p>The page you're looking for doesn't exist or an error occurred.</p>
    </body>
    </html>
    """, getattr(e, 'code', 500)  # Use e.code if available (e.g. 404), else 500


if __name__ == '__main__':
    app.run()
