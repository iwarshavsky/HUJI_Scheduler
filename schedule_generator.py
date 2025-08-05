import re
from urllib.parse import urlencode
from bs4 import BeautifulSoup
import requests

# Custom headers for GET/POST requests
headers = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": "en-US,en;q=0.9,he;q=0.8",
    "Cache-Control": "max-age=0",
    "Connection": "keep-alive",
    "Content-Type": "application/x-www-form-urlencoded",
    "Host": "shnaton.huji.ac.il",
    "Origin": "https://shnaton.huji.ac.il",
    "Referer": "https://shnaton.huji.ac.il/index.php",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0",
    "sec-ch-ua": '"Not)A;Brand";v="8", "Chromium";v="138", "Microsoft Edge";v="138"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"'
}


def requestCurrentYear():
    """
    Request the current scheduling year from the website.
    :return: return max year on the site.
    """
    response, url = make_request()
    soup = BeautifulSoup(response, 'html.parser')
    numbers = re.findall(r'\d+', soup.select(".subtitle")[0].text)
    if not numbers:
        return None  # or raise an error if preferred
    return max(map(int, numbers))


def make_request(course_id=-1, year=-1):
    """
    Request course_id from given year from the website.
    :param course_id:
    :param year:
    :return:
    """
    base_url = "https://shnaton.huji.ac.il/index.php"

    # Get home page to figure out what year it is
    if course_id == -1 and year == -1:
        response = requests.get(base_url, headers=headers)
        if response.status_code != 200:
            print("Error. Received code " + str(response.status_code))
            exit()

        return response.text, base_url

    data = {
        "year": year,
        "faculty": "0",
        "peula": "Simple",
        "option": "2",  # Milim beshem hakurs
        "word": "",
        "course": course_id
    }

    query_string = urlencode(data)

    full_url = f"{base_url}?{query_string}"
    response = requests.get(full_url, headers=headers)
    if response.status_code != 200:
        print("Error. Received code " + str(response.status_code))
        exit()

    return response.text, full_url


class CoursePool:
    def __init__(self):
        pass


class CourseBlock:
    def __init__(self, course_num, course_name, bs_el=None, data_dict=None):
        """
        Initialiaze a CourseBlock from raw HTML row - may include several events.
        We assume each row contains info of the same semester, same group.
        TIME_FINISH is not inclusive.
        :param bs_el: BeautifulSoup element
        """
        self.course_num = course_num
        self.course_name = course_name
        if bs_el:
            raw_keys = ["groups", "semester", "days", "hour", "lesson", "places", "note"]
            keys = ["groups", "semester", "days", "time_start", "time_finish", "lesson", "places", "note"]
            raw_attributes, self.warnings = self._extract_raw_attributes(bs_el, raw_keys)
            self._split_hour_column(raw_attributes)
            # Remove rows with no date/time/semester

            formatted_attributes = {key: list(map(lambda item: self.format(key, item), raw_attributes[key])) for key in
                                    keys}

            self.group = formatted_attributes.get("groups")[0]
            self.semester = formatted_attributes.get("semester")[0]
            # TODO - check for empty rows
            # TODO - custom events
            self.event_list = self._make_event_list(formatted_attributes,
                                                    keys=["days", "time_start", "time_finish", "lesson", "places",
                                                          "note"])

            self.lesson_type = formatted_attributes.get("lesson")[0]

        if data_dict:
            self.group = data_dict['group']
            self.semester = data_dict['semester']
            self.event_list = data_dict['event_list']
            self.lesson_type = data_dict['lesson_type']
            # TODO : should check validity of keys or am I OK with throwing an exception here?
        pass

    @staticmethod
    def _extract_raw_attributes(bs_el, attribute_lst):
        """
        Get the raw attributes from the given HTML
        """
        # return bs_el.find("div", {"class": "semester"}).div.string and warning if there was an error parsing
        attribute_dict = {}
        for attribute in attribute_lst:
            attribute_dict[attribute] = list(bs_el.find("div", {"class": attribute}).stripped_strings)
        warnings = []
        # Find max len of any key, pad the rest. Result is dict with list values of equal length
        max_len = max([len(attribute_data) for attribute_data in attribute_dict.values()])
        for attribute in attribute_lst:
            l = len(attribute_dict[attribute])
            if l != max_len:
                attribute_dict[attribute] += [''] * (max_len - l)
                warnings.append(attribute)
        return attribute_dict, warnings

    @staticmethod
    def _split_hour_column(raw_attributes):
        """
        Replace "hour" key with time_start and time_finish
        """
        dict_new_cols = {"time_start": [], "time_finish": []}
        for t_string in raw_attributes["hour"]:
            if t_string:
                time_finish, time_start = t_string.split("-")
                dict_new_cols["time_start"].append(time_start)
                dict_new_cols["time_finish"].append(time_finish)
        raw_attributes.pop("hour")

        raw_attributes["time_start"] = dict_new_cols["time_start"]
        raw_attributes["time_finish"] = dict_new_cols["time_finish"]

    @staticmethod
    def _make_event_list(raw_attribute_dict, keys):
        """
        Reorder the raw attribute dict so that the information isn't spread out between the different columns but
        is now divided into scheduled events
        :param raw_attribute_dict:
        :param keys:
        :return: array of scheduled events for this CourseBlock
        """
        # Make sure that there was no error parsing, all keys must have the same number of scheduled events
        if not all(len(raw_attribute_dict[k]) == len(raw_attribute_dict[keys[0]]) for k in keys):  # Invalid row
            print("Bad course")
            return []

        events = [{key: raw_attribute_dict[key][i] for key in keys}
                  for i in range(len(raw_attribute_dict[keys[0]]))]

        return events

    @staticmethod
    def format(key, value):
        """
        Format value of type key
        """
        try:
            if key == "semester":
                semester_mapping = {"סמסטר א": 0, "סמסטר ב": 1, "שנתי": "yearly"}
                return semester_mapping[value]
            elif key == "days":
                v = value.replace("יום ", "").replace("'", "")
                return ord(v) - 1488  # Convert Hebrew letter to corresponding number
            elif key in ["time_start", "time_finish"]:
                pass
                # t = datetime.strptime(value, "%-H:%M")
                # return t  # timedelta(hours=t.hour, minutes=t.minute)
                # return convert_time(value)
            elif key in "groups":
                v = value.replace("קבוצה (", "").replace(")", "")
                return v
                pass
            else:
                pass
        except:
            pass

        return value


class Course:
    """
    Class for multiple course blocks, contained inside pool_dict. A valid schedule must have one block exactly
    from each pool in each course's pool_dict.
    """

    def __init__(self, course_num, year, semester, pool_dict=None):
        self.course_num = course_num
        self.year = year
        self.semester = semester
        if pool_dict:
            self.pool_dict = pool_dict
        else:
            self.pool_dict = {}
            response, self.url = make_request(course_num, year)

            soup = BeautifulSoup(response, 'html.parser')

            COURSE_TABLE = "grid-container-wrapper"
            FIRST_ROW = "title-row"
            course_table = soup.find("div", COURSE_TABLE)
            soup.prettify()

            self.course_name = soup.select(".data-course-title")[0].text.strip()

            # Loop through children, first child has class="row title-row", should be ignored, the other have class="row"
            for row in course_table.find_all("div", recursive=False):
                if FIRST_ROW in row['class']:  # Ignore first row
                    continue
                session_group = CourseBlock(self.course_num, self.course_name, row)
                self.add_block(session_group)

    def add_block(self, courseBlock):
        """
        Add a block to the course, add it to relevant pool
        """
        if courseBlock.event_list and (self.semester == courseBlock.semester or courseBlock.semester == "yearly"):
            blocks_of_same_type = self.pool_dict.setdefault(courseBlock.lesson_type, [])
            blocks_of_same_type.append(courseBlock)

    def get_pools(self):
        """
        return pool dict as dictionary
        """
        return {(self.course_num, key): self.pool_dict[key] for key in self.pool_dict.keys()}
