import moment from "moment";

function formatMessage (username, text) {
    return {
        username,
        text,
        time: moment().format('hh:mm A')
    }
}

export default formatMessage;