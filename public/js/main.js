const chatForm = document.querySelector('#chat-form');
const chatLog = document.querySelector('#chatLog');
const chatMessages = document.querySelector('#chatMessages');
const userList = document.querySelector('#userList');
const roomName = document.querySelector('#roomName');

const socket = io();

const { username, room } = Qs.parse(location.search, {
    ignoreQueryPrefix: true,
});
document.querySelector('#user').textContent = username;

// Join chatroom
socket.emit('joinRoom', { username, room });

// Get room and users
socket.on('roomUsers', ({ room, users }) => {
  outputRoomName(room);
  outputUsers(users);
});

socket.on('message', message => {
    console.log(message);
    if(message.username === "ChatterooBot") {
        outputMessageBot(message);
    } else {
        if(message.username !== username) {
            outputMessageOthers(message);
        } else {
            outputMessageMe(message);    
        }
    }
    chatLog.children.item(chatLog.children.length - 1).scrollIntoView();
})

chatForm.addEventListener('submit', e => {
    e.preventDefault();
    const msg = e.target.elements.msg.value;
    if (msg != '') {
        chatLog.scrollTop = chatLog.scrollHeight;
        // Emit message to server
        socket.emit('chatMessage', msg);
    }
    
    e.target.elements.msg.value = '';
    e.target.elements.msg.focus();
})



// Function to output messages to the chat
function outputMessageBot(message) {
    const li = document.createElement('li');
    li.classList.add('w-full', 'flex', 'justify-center', 'gap-x-2', 'sm:gap-x-4');
    li.innerHTML = `
        <div class="w-3/4 bg-neutral-600 border border-gray-200 rounded-lg p-4 space-y-1">
        <p class="text-xs text-gray-300"><span id="username" class="font-bold text-white">${message.username}  </span><span>${message.time}</span></p>
        <p class="text-sm text-white">
            ${message.text}
          </p>
        </div>`;

    chatLog.appendChild(li);
}

function outputMessageOthers(message) {
    const li = document.createElement('li');
    li.classList.add('max-w-lg', 'flex', 'gap-x-2', 'sm:gap-x-4');
    li.innerHTML = `
        <div class="bg-green-600 border border-gray-200 rounded-2xl p-4 space-y-1">
        <p class="text-xs text-gray-200"><span id="username" class="font-bold text-green-200">${message.username}  </span><span>${message.time}</span></p>
        <p class="text-sm text-white">
            ${message.text}
          </p>
        </div>`;

    chatLog.appendChild(li);
}

function outputMessageMe(message) {
    const li = document.createElement('li');
    li.classList.add('max-w-lg', 'flex', 'gap-x-2', 'sm:gap-x-4', 'ms-auto', 'justify-end', 'px-5');
    li.innerHTML = `
        <div class="grow text-end space-y-3">
        <!-- Card -->
        <div class="inline-block bg-blue-600 rounded-2xl p-4 space-y-1">
          <p class="text-xs text-gray-200"><span id="username" class="font-bold text-blue-200">${message.username}  </span><span>${message.time}</span></p>
          <p class="text-sm text-white">
          ${message.text}
          </p>
        </div>
        <!-- End Card -->
      </div>`;

    chatLog.appendChild(li);
}

// Room Name
function outputRoomName(room) {
    roomName.textContent = room;
}

// users in room
function outputUsers(users) {
    console.log("users", users);
    userList.innerHTML = '';
    users.forEach((user) => {
        if(user.username === username) {
            const li = document.createElement('li');
            li.classList.add('py-1','text-sm','font-extrabold', 'text-gray-900');
            li.innerHTML = username + " (You)";
            userList.appendChild(li);

        } else {
            const other = document.createElement('li');
            other.classList.add('py-1','text-sm','font-medium', 'text-gray-700');
            other.innerHTML = user.username;
            userList.appendChild(other);
        }
    });
}

document.getElementById('leave-btn').addEventListener('click', () => {
    const leaveRoom = confirm('Are you sure you want to leave the chat?');
    if (leaveRoom) {
      window.location = '/home';
    } else {
    }
  });