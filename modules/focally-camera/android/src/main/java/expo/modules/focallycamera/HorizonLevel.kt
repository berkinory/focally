package expo.modules.focallycamera

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager

class HorizonLevel(
    context: Context,
    private val rotation: () -> Int,
    private val update: (Float?) -> Unit,
) : SensorEventListener {
    private val manager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val sensor =
        manager.getDefaultSensor(Sensor.TYPE_GRAVITY)
            ?: manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private var listening = false
    private var x = 0f
    private var y = 0f
    private var initialized = false
    private var lastSample = 0L

    fun setEnabled(enabled: Boolean) {
        if (enabled == listening) return
        if (enabled && sensor != null) {
            initialized = false
            lastSample = 0L
            listening = manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME)
        } else {
            manager.unregisterListener(this)
            listening = false
            update(null)
        }
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (!listening) return
        val dt =
            if (lastSample == 0L) 0.02
            else ((event.timestamp - lastSample) / 1e9).coerceIn(0.0, 0.1)
        lastSample = event.timestamp
        val alpha =
            if (event.sensor.type == Sensor.TYPE_GRAVITY) 1f
            else (1 - kotlin.math.exp(-dt / 0.06)).toFloat()
        x = if (initialized) x + alpha * (event.values[0] - x) else event.values[0]
        y = if (initialized) y + alpha * (event.values[1] - y) else event.values[1]
        initialized = true
        update(CameraMath.horizon(x, y, rotation()))
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
