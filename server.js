const fs = require('fs');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const path = require('path');
const DATA_FILE = path.join(__dirname, 'data.json');
const cors = require('cors');
app.use(cors());

const timers = {
    motionDynamicOnTimeout: null,
    motionDynamicOffTimeout: null,
};

app.use((req, res, next) => {
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    next();
});

app.get('/', (req, res) => {
    res.send('Hello Vercel!');
});

function getDefaultData() {
    return {
        lights: {
            1: { state: false, timerStart: null, history: [] },
            2: { state: false, timerStart: null, history: [] },
            3: { state: false, timerStart: null, history: [] },
            4: { state: false, timerStart: null, history: [] },
            5: { state: false, timerStart: null, history: [] },
            6: { state: false, timerStart: null, history: [] },
        },
        motionSensorStatic: { state: false, history: [] },
        gasSensor: { state: false, history: [] },
        motionSensorDynamic: { state: false, history: [] },
        temperature: { current: 22.0, history: [] },
        humidity: { current: 50.0, history: [] },
    };
}

function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(DATA_FILE));
        } catch {
            return getDefaultData();
        }
    } else {
        return getDefaultData();
    }
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function recordSensorHistory(sensor, state) {
    const now = Date.now();
    if (sensor.history.length === 0 || sensor.history[sensor.history.length - 1].state !== state) {
        sensor.history.push({ timestamp: now, state });
    }
}

function updateSensors() {
    const data = loadData();

    let tempChange = (Math.random() * 0.2) - 0.1;
    let newTemp = +(data.temperature.current + tempChange).toFixed(1);
    if (newTemp < 18) newTemp = 18.0;
    if (newTemp > 26) newTemp = 26.0;
    if (newTemp !== data.temperature.current) {
        data.temperature.current = newTemp;
        data.temperature.history.push({ timestamp: Date.now(), value: newTemp });
    }

    let humidityChange = (Math.random() * 6) - 3;
    let newHumidity = +(data.humidity.current + humidityChange).toFixed(1);
    if (newHumidity < 30) newHumidity = 30.0;
    if (newHumidity > 80) newHumidity = 80.0;
    if (newHumidity !== data.humidity.current) {
        data.humidity.current = newHumidity;
        data.humidity.history.push({ timestamp: Date.now(), value: newHumidity });
    }

    if (data.motionSensorStatic.state !== false) {
        data.motionSensorStatic.state = false;
        recordSensorHistory(data.motionSensorStatic, false);
    }
    if (data.gasSensor.state !== false) {
        data.gasSensor.state = false;
        recordSensorHistory(data.gasSensor, false);
    }

    if (!timers.motionDynamicOnTimeout && !timers.motionDynamicOffTimeout) {
        const interval = (3 * 60 * 1000) + Math.random() * (2 * 60 * 1000);
        timers.motionDynamicOnTimeout = setTimeout(() => {
            data.motionSensorDynamic.state = true;
            recordSensorHistory(data.motionSensorDynamic, true);
            saveData(data);

            const activeDuration = 1000 + Math.random() * 4000;
            timers.motionDynamicOffTimeout = setTimeout(() => {
                data.motionSensorDynamic.state = false;
                recordSensorHistory(data.motionSensorDynamic, false);
                saveData(data);

                timers.motionDynamicOnTimeout = null;
                timers.motionDynamicOffTimeout = null;
            }, activeDuration);
        }, interval);
    }

    saveData(data);
    return data;
}

updateSensors();

setInterval(updateSensors, 3 * 60 * 1000);

app.use(express.json());


app.get('/current', (req, res) => {
    const data = loadData();

    const currentData = {
        lights: {},
        motionSensorStatic: data.motionSensorStatic.state,
        gasSensor: data.gasSensor.state,
        motionSensorDynamic: data.motionSensorDynamic.state,
        temperature: data.temperature.current,
        humidity: data.humidity.current,
    };

    for (let i = 1; i <= 6; i++) {
        currentData.lights[i] = data.lights[i].state;
    }

    res.json(currentData);
});

app.get('/history', (req, res) => {
    const data = loadData();

    const historyData = {
        lights: {},
        motionSensorStatic: data.motionSensorStatic.history,
        gasSensor: data.gasSensor.history,
        motionSensorDynamic: data.motionSensorDynamic.history,
        temperature: data.temperature.history,
        humidity: data.humidity.history,
    };

    for (let i = 1; i <= 6; i++) {
        historyData.lights[i] = data.lights[i].history;
    }

    res.json(historyData);
});

app.post('/generate', (req, res) => {
    const newData = updateSensors();
    res.json(newData);
});

app.get('/', (req, res) => {
    res.send('Сервер работает. Маршруты: /current (текущие данные), /history (история), /generate (обновить)');
});

app.post('/update-light', (req, res) => {
    try {
        const { lightId, state } = req.body;
        const data = loadData();

        if (!data.lights[lightId]) {
            return res.status(404).json({ error: `Лампа ${lightId} не найдена` });
        }

        const light = data.lights[lightId];
        const previousState = light.state;

        if (previousState !== state) {
            if (state === true) {
                light.timerStart = Date.now();
            }
            else if (previousState === true) {
                const duration = Date.now() - light.timerStart;
                light.history.push({
                    timestamp: Date.now(),
                    duration: duration
                });
                light.timerStart = null;
            }

            light.state = state;
            recordSensorHistory(light, state);
            saveData(data);
        }

        res.json({
            success: true,
            lightId: lightId,
            newState: state,
            history: light.history
        });

    } catch (error) {
        console.error('Ошибка при обновлении лампы:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

module.exports = app;
/*
Сервер работает. Маршруты: /current (текущие данные), /history (история), /generate (обновить),
/update-light (куда приходит ответ POST) прверить можно на Postman 
Body
raw json
{
    "lightId": "1",
    "state": true
}
*/