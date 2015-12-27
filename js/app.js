/* global selected_course */
/* global course_search_table */
/* global id_to_crn_dict */
/* global linked_course_overriden */
/* global suggestion_list */
/* global course_description_table */
/* global color_dict */
/* global schedule_result */
/* global current_class_index */
/* global class_events */
class_events = [];
current_class_index = 0;
schedule_result = [];
color_dict = {};
course_description_table = {};
course_search_table = [];
id_to_crn_dict = {};
linked_course_overriden = {};
suggestion_list = {};
selected_course = {};

// proxy functions for current schedule index
function set_current_class_index(i) {
    current_class_index = i;
    // check all the boundaries
    $("#show-left").prop("disabled", current_class_index == 0);
    $("#show-right").prop("disabled", current_class_index == schedule_result.length - 1);
    $("#paging").text((current_class_index + 1).toString() + " / " + schedule_result.length.toString());
    $("#jump-value").val(i + 1);
    handle_schedule_render();
}

function get_current_class_index() {
    return current_class_index;
}


function guidGenerator() {
    var S4 = function() {
        return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
    };
    return (S4() + S4() + "-" + S4());
}

function get_class_entry_from_crn(search_items, crn) {
    return $.grep(search_items, function(n, i) {
        return $.inArray(crn, n.crn) != -1;
    });
}

function count_one(x) {
    x = (x & (0x55555555)) + ((x >> 1) & (0x55555555));
    x = (x & (0x33333333)) + ((x >> 2) & (0x33333333));
    x = (x & (0x0f0f0f0f)) + ((x >> 4) & (0x0f0f0f0f));
    x = (x & (0x00ff00ff)) + ((x >> 8) & (0x00ff00ff));
    x = (x & (0x0000ffff)) + ((x >> 16) & (0x0000ffff));
    return x;
}

function compare_score(a, b) {
    if (a.score < b.score)
        return 1;
    if (a.score > b.score)
        return -1;
    return 0;
}

function score_schedule(schedule) {
    // this checks the morning and evening classes

    // flatten the time table
    var times = [0, 0, 0, 0, 0]
    for (var i = 0; i < schedule.length; i++) {
        var single_class = schedule[i];
        for (var j = 0; j < single_class.t.length; j++) {
            times[j] |= single_class.t[j];
        }
    }

    var negative_score_mask = 0xFFF00003;
    var negative_score_1 = 0;
    for (var i = 0; i < times.length; i++) {
        negative_score_1 += count_one(times[i] & negative_score_mask);
    }

    // counting for dis-continuity
    var negative_score_2 = 0;
    var negative_score_2_mask_1 = 5; //(101) check if there is a half hour gap between two classes
    var negative_score_2_mask_2 = 9; // (1001) check if there is an one hour gap between two classes
    for (var i = 0; i < times.length; i++) {
        var time = times[i];
        for (var j = 0; j < 32 - 3; j++) {
            var mask = negative_score_2_mask_1 << j;
            if ((time & mask) === mask) {
                negative_score_2++;
            }
        }
        for (var j = 0; j < 32 - 5; j++) {
            var mask = negative_score_2_mask_2 << j;
            if ((time & mask) === mask) {
                negative_score_2++;
            }
        }
    }

    var total_negative = negative_score_1 * 5 + negative_score_2 * 5;
    // work-around of the bug
    if (total_negative > 80) {
        return 20;
    } else {
        return 100 - total_negative;
    }
}

function has_overlap(array1, array2){
    // N * M, since it's not a large list
    var result = [];
    for(var i = 0; i < array1.length; i++){
        for(var j = 0; j < array2.length; j++){
            if(array1[i] === array2[j]){
                result.push([array1[i]]);
            }
        }
    }
    return result;
}

function schedule(selected_course, courses, search_items) {
    // flatten overridden list
    var course_overriden = [];
    for(var key in linked_course_overriden){
        course_overriden = $.merge(course_overriden, linked_course_overriden[key]);
    }
    // create a two dimensional array
    var classes = [];
    $.each(selected_course, function(ref_key, entry) {
        classes.push(entry);
        // need to check if l exists
        var entries = get_class_entry_from_crn(search_items, entry[0]);
        if (entries.length > 0 && entries[0].l) {
            $.each(entries[0].l, function(name, links) {
                var overlapped_list = has_overlap(links, course_overriden);
                if(overlapped_list.length > 0){
                    for(var i = 0; i < overlapped_list.length; i++){
                        var entry = overlapped_list[i];
                        classes.push(entry);
                    }
                }else{
                    classes.push(links);
                }
            });
        }
    });
    var result = [];
    var current_classes = [];
    var available_classes = [];
    $.each(classes, function(index, entry1) {
        var class_entry = [];
        $.each(entry1, function(index2, entry2) {
            var entry3 = courses[entry2];
            entry3["crn"] = entry2;
            class_entry.push(entry3);
        });
        available_classes.push(class_entry);
    });
    select_course(current_classes, available_classes, result);

    for (var i = 0; i < result.length; i++) {
        var entry = result[i];
        entry.score = score_schedule(entry);
    }
    result.sort(compare_score);
    schedule_result = result;

    if (schedule_result.length == 0) {
        $("#schedule-row").hide("slow");
        $(".footer").show("slow");
        BootstrapDialog.alert({
            type: BootstrapDialog.TYPE_WARNING,
            title: "I'm sorry",
            message: 'There is no available schedule that fits your course selection. Maybe try a different one?',
        });
    } else {
        set_current_class_index(0);
        // set the max jump
        $("#jump-value").attr("data-max", schedule_result.length);

    }
}


function handle_schedule_render() {
    $(".footer").fadeOut(500);

    render_star(schedule_result[current_class_index].score);

    $("#schedule-row").fadeIn(1500);
    $('#calendar').fadeIn(1500).fullCalendar('render');
    render_schedule(schedule_result[current_class_index]);

}

function render_star(score) {
    var id = 1
    for (var i = 0; i < score; i += 20) {
        $("#star-" + id.toString()).css({
            opacity: 1,
            width: score.toString() + "%"
        });
    }
}

function render_schedule(classes) {
    // clear the old reference. Due to the implementation of fullCalendar, it's very clumsy
    $("#calendar").fullCalendar('removeEventSource', class_events);
    // marking classes
    var marked_classes = [];
    for (var i = 0; i < classes.length; i++) {
        for (var j = 0; j < classes[i].t.length; j++) {
            // use a simple state machine here
            var has_class = false;
            var duration_count = 0;
            var first_hit = 0;
            var day = classes[i].t[j];
            for (var k = 0; k < 28; k++) {
                if ((day & (1 << k)) != 0) {
                    // has class here
                    if (!has_class) {
                        first_hit = k;
                        has_class = true;
                    }
                    duration_count += 1
                } else {
                    if (has_class) {
                        // a class ends
                        has_class = false;
                        marked_classes.push({
                            "n": classes[i].n,
                            "i": i,
                            'crn': classes[i].crn,
                            "day": j,
                            "duration": duration_count,
                            "start": first_hit
                        });
                        duration_count = 0;
                    }
                }
            }

            // if it finishes at the ends
            if (has_class) {
                marked_classes.push({
                    "n": classes[i].n,
                    "i": i,
                    'crn': classes.crn,
                    "day": j,
                    "duration": duration_count,
                    "start": first_hit
                });
            }
        }
    }

    class_events.length = 0;

    for (var i = 0; i < marked_classes.length; i++) {
        var marked_class = marked_classes[i];
        var start_time = moment().startOf('isoweek').add(marked_class.day, "d").add(8, "h").add(marked_class.start * 30, "m");
        var class_entry = {
            "title": marked_class.n,
            "start": start_time,
            "allDay": false,
            "end": moment().startOf('isoweek').add(marked_class.day, "d").add(8, "h").add((marked_class.start + marked_class.duration) * 30 - 5, "m"),
            "crn": marked_class.crn,
            "borderColor": color_dict[marked_class.crn]
        }
        class_events.push(class_entry);
    }

    $('#calendar').fullCalendar('addEventSource', class_events);
}

function copy_array(old_array) {
    // this does shallow copy of an array
    var result = [];
    for (var i = 0; i < old_array.length; i++) {
        result.push(old_array[i]);
    }
    return result;
}

// this is recursive call with dynamic programming fashion
function select_course(current_classes, remaining_classes, result) {
    if (remaining_classes.length == 0) {
        // a valid choice
        result.push(copy_array(current_classes));
        return;
    }

    // choose the next class
    var next_class = remaining_classes[0];
    for (var i = 0; i < next_class.length; i++) {
        // choose one by one
        var choice = next_class[i];

        // check for conflict
        if (!is_new_class_conflicted(current_classes, choice)) {
            // add it to the current list
            // and remove the next class from the remaining_classes
            current_classes.push(choice)
            remaining_classes.shift();
            // call the function recursively
            select_course(current_classes, remaining_classes, result);
            // reset the state
            current_classes.pop();
            remaining_classes.unshift(next_class);
        }

    }
}

function is_single_class_conflicted(class1, class2) {
    var time1 = class1.t;
    var time2 = class2.t;
    for (var i = 0; i < 5; i++) {
        if ((time1[i] & time2[i]) != 0) {
            return true;
        }
    }
    return false;
}

function is_new_class_conflicted(classes, new_class) {
    for (var i = 0; i < classes.length; i++) {
        if (is_single_class_conflicted(classes[i], new_class)) {
            return true;
        }
    }
    return false;
}

function setup_typeahead(search_items, tag_items) {
    var filted_list = $.grep(search_items, function(entry) { 
    return entry.is_l !== true;
    });
    var courses = new Bloodhound({
        datumTokenizer: Bloodhound.tokenizers.obj.whitespace('n'),
        queryTokenizer: Bloodhound.tokenizers.whitespace,
        local: filted_list
    });
    $('#search .typeahead').typeahead(null, {
        name: 'bucknell-courses',
        source: courses.ttAdapter(),
        displayKey: function(e) {
            if (e.nn) {
                return "nn";
            } else {
                return "n";
            }
        },
        templates: {
            empty: [
                '<div class="empty-message">',
                'Unable to find any courses that match the query',
                '</div>'
            ].join('\n'),
            suggestion: function(e) {
                return create_description(e, search_items)
            }
        },
        limit: 100
    });
}



function create_description(e, search_items) {
    if (e.d) {
        return '<div><strong>' + e.n + ': ' + e.ti + '</strong> <br> ' + e.d + '</div>';
    } else {
        // need to pull it out from search
        // if (e.nn) {}
        var entries = get_class_entry_from_crn(search_items, e.n);
        var entry;
        for (var i = 0; i < entries.length; i++) {
            entry = entries[i];
            if (entry.d) {
                break;
            }
        }
        return '<div><strong>' + e.n + ': ' + e.nn + '</strong> <br> ' + entry.d + '</div>';
    }
}

function handle_color_creation(crn_list) {
    var first_crn = crn_list[0];
    var color;
    if (!(first_crn in color_dict)) {
        color = Please.make_color({
            format: 'rgb-string'
        });
        for (var i = 0; i < crn_list.length; i++) {
            var crn = crn_list[i];
            color_dict[crn] = color;
        }
    } else {
        color = color_dict[first_crn];
    }
    return color;
}

function create_label_dropdown(crn_list, id, default_value, is_linked){
    // do a linear search
    // doing as best as I can
    var count = 0;
    var result = "";
    var temp_list = {};
    for(var i = 0; i < course_search_table.length && count < crn_list.length; i++){
        var entry = course_search_table[i];
        if(crn_list.indexOf(entry.n) >= 0){
            temp_list[entry.n] = entry.nn;
            count++;
        }
    }
    result += '<li ref="' + id + '" data-linked="' + (is_linked? 'yes' : 'no') + '"><a style="color:white" ref="session_switch" id="' + default_value.replace(" ", "_") + '"><strong>'  + default_value + '</strong></a></li>';
    // sort the temp_list so that it's in alphabetic order
    var sorted_keys = [];
    for(var key in temp_list){
        sorted_keys.push(key);
    }
    sorted_keys.sort(function(a, b) { return (temp_list[a] > temp_list[b]) ? 1 : -1;});
    
    for(var i = 0; i < sorted_keys.length; i++){
        var key = sorted_keys[i];
        var name = temp_list[key];
        result += '<li ref="' + id + '"data-linked="' + (is_linked? 'yes' : 'no') + '"><a style="color:white" ref="session_switch" id="' + key + '"><strong>' + name + '</strong></a></li>';
    }
    return result;
}

// function returns a dictionary {id:html}
function create_label_for_class(random_id_main, suggestion, supress_link){
    var result = {};
    // add colors
    var color = handle_color_creation(suggestion.crn);
    if (!(random_id_main in id_to_crn_dict)) { id_to_crn_dict[random_id_main] = suggestion.crn; }
    // check whether the entry to add is a linked list
    var is_linked = (typeof suggestion.is_l) !== "undefined";
    var html_main = '<div class="dropdown" style="display:inline" ref="' + random_id_main +'"><span class="tag label label-info dropdown-toggle" data-toggle="dropdown" id="' + random_id_main + '" style="background-color:' + color + '">' 
    + (suggestion.nn? suggestion.nn: suggestion.n) +  (is_linked? "" : '<a class="remove fa fa-times">') + '</a></span><ul class="dropdown-menu  session-dropdown" style="background-color:' + color + ';"id="drop-' + random_id_main +'">';
    
    html_main += create_label_dropdown(suggestion.crn, random_id_main, (suggestion.nn? suggestion.nn: suggestion.n), false);
    
    html_main +="</ul></div>";
    result[random_id_main] = html_main;
    if(is_linked || supress_link) { return result; }
    if (suggestion.l && Object.keys(suggestion.l).length > 0) {
        $.each(suggestion.l, function(key, value) {
            var l_color = handle_color_creation(value);
            var tooltip = suggestion.n + " requires " + key;
            var link_random_id = guidGenerator();
            if(!(link_random_id in id_to_crn_dict)) { id_to_crn_dict[link_random_id] = value;}
            var link_html = '<div class="dropdown" style="display:inline"' + '" ref="' + random_id_main +'"><span style="background-color:' + l_color + '" class="tag label label-info dropdown-toggle" data-toggle="dropdown" data-placement="bottom" title="' + tooltip +  '" id="' + link_random_id +'">' + key + '</span><ul class="dropdown-menu session-dropdown" style="background-color:' + l_color + ';"id="drop-' + link_random_id +'">';
            link_html += create_label_dropdown(value, link_random_id, key, true);
            link_html +="</ul></div>";
            result[link_random_id] = link_html;
            if ($(window).width() > 700) {
                $('body').tooltip({
                    selector: "#" + link_random_id,
                    container: 'body'
                });
            }
        });
    }
    return result;
}

function get_search_entry_from_crn(crn){
    for(var i = 0; i < course_search_table.length; i++){
        if(course_search_table[i].n === crn){
            return course_search_table[i];
        }
    }
}


function add_class_entry_to_selected(entry, supress_link){
    var random_id = guidGenerator();
    suggestion_list[random_id] = entry;
    var result = create_label_for_class(random_id, entry, supress_link);
    for(var key in result){
        var html = result[key];
        $(html).appendTo($('#course-selection')).hide().fadeIn(600);
        
        // toggle the drop down
        $("#key").dropdown();
    }
    // add event listener
    $(document).on("click", "[ref=session_switch]", function(e) {
        e.stopPropagation();
        e.preventDefault();
        e.stopImmediatePropagation();
        var text = $(e.target).text();
        var a = $(e.target).parent();
        var li = a.parent();
        var is_linked = li.attr("data-linked") === "yes";
        var crn = $(this).attr("id");
        var ref = $(this).parent().attr("ref");
        if(isNaN(crn)){
            // original course number
            if(is_linked){
                delete linked_course_overriden[ref];
            }
            else{
                selected_course[ref] = suggestion_list[ref].crn;
            }
        }else{
            if(is_linked){
                // add to overridden linked list 
                linked_course_overriden[ref] = [crn];
            }
            else{
                selected_course[ref] = [crn];
            }
        }
        
        // change the label text
        var id = li.attr("ref");
        $("#" + id).text(text).fadeIn(200);
        
        
    });

    // add it to the selected courses if it's not a linked list
    if(typeof(entry.is_l) === "undefined"){
        selected_course[random_id] = entry.crn;
    }
}

function handle_selection(selected_course) {
    $('#search .typeahead').bind('typeahead:select', function(ev, suggestion) {
        add_class_entry_to_selected(suggestion, false);

        // clear the search input
        $('.typeahead').typeahead('val', '');
    });
}

function generate_course_desp(course_name) {
    var entry, entry2;
    var crn;
    if (isNaN(course_name)) {
        // actual course name
        // this way is proven to be faster than $.grep
        for (var key in course_description_table) {
            entry = course_description_table[key];
            if (entry.n == course_name) {
                crn = key;
                break;
            }
        }
        
        // grab the title and description
        for (var key in course_search_table) {
            entry2 = course_search_table[key];
            if (entry2.crn.indexOf(crn) >= 0) {
                break;
            }
        }

    } else {
        entry = course_description_table[course_name];
        crn = course_name;

    }
    return "<p><b>Title: </b>" + entry2.ti + "</p>" + "<p><b>Instructor: </b>" + entry.i + "</p>" +
        "<p><b>Description: </b>" + entry2.d + "</p>" + "<p><b>Location: </b>" + (entry.r == "" ? "TBA" : entry.r) + "</p>" +
        "<p><b>CRN: </b>" + crn + "</p>";
}

function create_tag_desc(desc_table, tags, ccc) {
    var list = tags[ccc];
    var result = "";
    for (var i = 0; i < list.length; i++) {
        var entry = list[i];
        for (var j = 0; j < desc_table.length; j++) {
            var class_entry = desc_table[j];
            if (class_entry.n === entry) {
                result += '<p><b>' + entry + ' </b>' + class_entry.ti + ": " + class_entry.d.split(".")[0] + '.</p>';
            }
        }
    }
    return result;
}

function create_tour() {
    // Instance the tour
    var tour = new Tour({
        steps: [{
                element: "#toggle-tag-search",
                title: "Quick requirement lookup",
                content: "Click here to look up all the requirement-related courses",
                placement: "left"
            }, {
                element: "#search-box",
                title: "Search courses",
                content: "Type the course name or CRN here to add your class to the search list",
                placement: "bottom"
            }, {
                element: "#search-button",
                title: "Schedule",
                content: "Click here to let Ninja schedule your classes for you",
                placement: "bottom"
            }, {
                element: "#toggle-web-tour",
                title: "Web tour",
                content: "Click here to toggle the web tour again.",
                placement: "left"
            }

        ]
    });

    tour.init();

    return tour;
}

$(function() {
    // download the search_items
    var search_list = [];
    $('#calendar').fullCalendar({
        height: "auto",
        weekends: false, // will hide Saturdays and Sundays
        header: {
            left: "",
            right: ''
        },
        defaultView: "agendaWeek",
        columnFormat: "ddd",
        defaultDate: moment().startOf('isoweek'), // just start from Monday
        allDaySlot: false,
        minTime: "8:00:00",
        maxTime: "22:00:00",
        displayEventTime: false,
        windowResize: function(view) {
            if ($(window).width() < 300) {
                $('#calendar').fullCalendar('changeView', 'basicWeek');

            } else {
                $('#calendar').fullCalendar('changeView', 'agendaWeek');
            }
        },
        eventClick: function(calEvent, jsEvent, view) {
            var course_name = calEvent.title;
            BootstrapDialog.alert({
                title: course_name,
                message: generate_course_desp(course_name)
            });
        },
        eventMouseover: function(event, jsEvent, view) {
            $(this).css("background-color", color_dict[event.crn]);
        },
        eventMouseout: function(event, jsEvent, view) {
            $(this).css("background-color", "white");
        },
    });
    $('#calendar').fullCalendar('addEventSource', class_events);


    $(document).on("click", ".remove", function(e) {
        var parent = $(e.target).parent();
        var ref = parent.attr("id");
        // remove the html element
        $("[ref=" + ref + "]").hide().remove();

        // remove it from the selected courses
        delete selected_course[ref];
    });

    $.getJSON("data/bucknell/search.json", function(search_items) {
        course_search_table = search_items;
        $('#tag-search-modal').on('show.bs.modal', function(e) {
            // first time
            var isEmpty = $("#tag-content").html() === "";
            if (isEmpty) {
                $.getJSON("data/bucknell/tag.json", function(tags) {
                    for (var ccc in tags) {
                        $("#sidebar").append('<li><a ref=tag-search>' + ccc + '</a></li>');

                    }
                    $("[ref=tag-search]").click(function(e) {
                        var tag = $(e.target).text();
                        var p = create_tag_desc(search_items, tags, tag);
                        $("#tag-content").empty();
                        $(p).appendTo($('#tag-content')).hide().show(500);
                    });
                    var p = create_tag_desc(search_items, tags, ccc);
                    $("#tag-content").empty();
                    $(p).appendTo($('#tag-content')).hide().show(500);

                });
            }
        });

        setup_typeahead(search_items);
        search_list = search_items;
    });

    $.getJSON("data/bucknell/courses.json", function(data) {
        selected_course = {};
        handle_selection(selected_course);

        course_description_table = data;

        $('#search-button').click(function() {
            if (Object.keys(selected_course).length == 0) {
                BootstrapDialog.alert({
                    type: BootstrapDialog.TYPE_WARNING,
                    title: "Warning",
                    message: 'Please select as least one course to schedule.',
                });

            } else {
                schedule(selected_course, data, search_list);
            }
        });

    });

    $("#show-left").click(function() {
        set_current_class_index(current_class_index - 1);
    });

    $("#show-right").click(function() {
        set_current_class_index(current_class_index + 1);
    });



    $("#download").click(function() {
        var classes = schedule_result[current_class_index];
        var url = "download.html?";
        for (var i = 0; i < classes.length; i++) {
            var key = classes[i].crn;
            url += key + "=" + key + "&"
        }

        url = url.substring(0, url.length - 1);
        $('#download-modal').on('show.bs.modal', function() {
            $('#download-iframe').attr("src", url);

        });
        $('#download-modal').modal('show');
    });

    $("#toggle-tag-search").click(function() {
        $("#tag-search-modal").modal('toggle');
    });


    $("#jump-schedule").click(function() {
        set_current_class_index(parseInt($("#jump-value").val()));
        $('#paging').popover('hide');
    });

    $("#paging").popover({
        html: true,
        title: function() {
            return "Choose a schedule to display";
        },
        content: function() {
            return $("#jump-content").html();
        },
        placement: "bottom",
    });
    // fix for https://github.com/twbs/bootstrap/issues/16732
    $('body').on('hidden.bs.popover', function(e) {
        $(e.target).data("bs.popover").inState.click = false;
    });

    $(document).on("click", "#jump-schedule", function(e) {
        if (!isNaN($("#jump-value").val())) {
            var val = parseInt($("#jump-value").val());
            var max_val = parseInt($("#jump-value").attr("data-max"));
            if (val <= max_val && val > 0) {
                set_current_class_index(val - 1);
            }
        }
        $("#paging").popover("hide");
    });

    $(document).on("click", "#cancel-jump-schedule", function(e) {
        $("#paging").popover("hide");
    });

    var tour = create_tour();
    $("#toggle-web-tour").click(function() {
        tour.start(true);
    });
    
    // test the schedule storage
    if(!localStorage.getItem("storage")){
        $("#upload").hide();
    } else {
        var raw_class_list = localStorage.getItem("storage");
        var class_list = JSON.parse(raw_class_list);
        if (Object.keys(class_list).length === 0) {
            $("#upload").hide();
        }
        $("#upload").click(function(){
            $("#course-upload-table").empty();
            var raw_class_list = localStorage.getItem("storage");
            var class_list = JSON.parse(raw_class_list);
            if (Object.keys(class_list).length === 0) {
                $("#upload").hide();
                return;
            }
            var raw_html = "";
            for(var name in class_list){
                var classes = class_list[name];
                raw_html += "<tr><td>" + name + "</td><td>";
                var temp = "";
                for(var j = 0; j < classes.length; j++){
                    temp += course_description_table[classes[j]].n + "; " + (j % 3 == 2 && j != classes.length - 1 ? "<br>" : "");
                }
                raw_html += temp.substring(0, temp.length - 2) + "</td>";
                var id = 'schedule-' + name;
                raw_html += '<td><a><i id="' + id + '" class="fa fa-upload upload-icon"></i></a><a><i style="color:red; position:relative; left:1vw" ref="' 
                + id + '"class="fa fa-times upload-delete-icon"></i></a></td></tr>';
            }
            $("#course-upload-table").append(raw_html);
            
            // set up the events
            $(".upload-icon").click(function(){
                var id = $(this).attr("id");
                var name = id.replace(id.split("-")[0] + "-", "");
                // JS scoping problem
                var load_classes = JSON.parse(localStorage.getItem("storage"));
                var load_class = load_classes.name;
                for(var i = 0; i < load_class.length; i++){
                    var entry = get_search_entry_from_crn(load_class[i]);
                    // add it to the overriden list
                    if(entry.is_l){
                        var random_id = guidGenerator();
                        linked_course_overriden[random_id] = [load_class[i]];
                    }
                    add_class_entry_to_selected(entry, true);
                }
                $('#load-modal').modal("hide");
            });
            
            $(".upload-delete-icon").click(function(){
                // re-consider the implementation.
                // consiering move it to global variable
                var id = $(this).attr("ref");
                var name = id.replace(id.split("-")[0] + "-", "");
                var load_classes = JSON.parse(localStorage.getItem("storage"));
                delete load_classes[name];
                localStorage.setItem("storage", JSON.stringify(load_classes));
                $('#load-modal').modal("hide");
                $(this).closest("tr").fadeOut(400).remove();
                if(Object.keys(load_classes).length === 0){
                    $("#upload").hide();
                }
            });
            
            // show the modal
            $('#load-modal').modal("show");
        });
    }
    
    $("#save-schedule").click(function(){
         BootstrapDialog.show({
             message: 'Please enter the name for your schedule: <input type="text" class="form-control">',
             onhide: function (dialogRef) {
                 var name = dialogRef.getModalBody().find('input').val();
                 if ($.trim(name).length === 0) {
                     return false;
                 }
             },
             buttons: [{
                 label: 'OK',
                 action: function (dialogRef) {
                     var name = dialogRef.getModalBody().find('input').val();
                     var classes = schedule_result[current_class_index];
                     var class_list = [];
                     for (var i = 0; i < classes.length; i++) {
                        class_list.push(classes[i].crn);
                    }
                     // save to browser
                     // pop up to enter the name
                     var str_storage = localStorage.getItem("storage");
                     var storage = JSON.parse(str_storage);
                     if ((typeof storage === "undefined") || (storage == null)) {
                         storage = {};
                     }
                     storage[name] = class_list;
                     localStorage.setItem("storage", JSON.stringify(storage));

                     dialogRef.close();
                     
                     $("#upload").fadeIn(300);
                 }
             }]
         });
    });
    
    // $("#search-box").keypress(function(){
    //     $("#upload").hide();
    // });
    
    if ($(window).width() >= 700) {
        // enable tooltips
        $('[data-toggle="tooltip"]').tooltip();
    };
});