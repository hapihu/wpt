'use strict';

/* Bluetooth Constants */

/**
 * HCI Error Codes.
 * Used for simulateGATT{Dis}ConnectionResponse. For a complete list of
 * possible error codes see BT 4.2 Vol 2 Part D 1.3 List Of Error Codes.
 */
const HCI_SUCCESS = 0x0000;
const HCI_CONNECTION_TIMEOUT = 0x0008;

/**
 * GATT Error codes.
 * Used for GATT operations responses. BT 4.2 Vol 3 Part F 3.4.1.1 Error
 * Response
 */
const GATT_SUCCESS = 0x0000;
const GATT_INVALID_HANDLE = 0x0001;

/* Bluetooth UUID Constants */

/* Service UUIDs */
var blocklist_test_service_uuid = '611c954a-263b-4f4a-aab6-01ddb953f985';
var request_disconnection_service_uuid = '01d7d889-7451-419f-aeb8-d65e7b9277af';

/* Characteristic UUIDs */
var blocklist_exclude_reads_characteristic_uuid =
    'bad1c9a2-9a5b-4015-8b60-1579bbbf2135';
var request_disconnection_characteristic_uuid =
    '01d7d88a-7451-419f-aeb8-d65e7b9277af';

/* Descriptor UUIDs */
var blocklist_test_descriptor_uuid = 'bad2ddcf-60db-45cd-bef9-fd72b153cf7c';
var blocklist_exclude_reads_descriptor_uuid =
    'bad3ec61-3cc3-4954-9702-7977df514114';

/**
 * Helper objects that associate Bluetooth names, aliases, and UUIDs. These are
 * useful for tests that check that the same result is produces when using all
 * three methods of referring to a Bluetooth UUID.
 */
var generic_access = {
  alias: 0x1800,
  name: 'generic_access',
  uuid: '00001800-0000-1000-8000-00805f9b34fb'
};
var device_name = {
  alias: 0x2a00,
  name: 'gap.device_name',
  uuid: '00002a00-0000-1000-8000-00805f9b34fb'
};
var reconnection_address = {
  alias: 0x2a03,
  name: 'gap.reconnection_address',
  uuid: '00002a03-0000-1000-8000-00805f9b34fb'
};
var heart_rate = {
  alias: 0x180d,
  name: 'heart_rate',
  uuid: '0000180d-0000-1000-8000-00805f9b34fb'
};
var health_thermometer = {
  alias: 0x1809,
  name: 'health_thermometer',
  uuid: '00001809-0000-1000-8000-00805f9b34fb'
};
var body_sensor_location = {
  alias: 0x2a38,
  name: 'body_sensor_location',
  uuid: '00002a38-0000-1000-8000-00805f9b34fb'
};
var glucose = {
  alias: 0x1808,
  name: 'glucose',
  uuid: '00001808-0000-1000-8000-00805f9b34fb'
};
var battery_service = {
  alias: 0x180f,
  name: 'battery_service',
  uuid: '0000180f-0000-1000-8000-00805f9b34fb'
};
var battery_level = {
  alias: 0x2A19,
  name: 'battery_level',
  uuid: '00002a19-0000-1000-8000-00805f9b34fb'
};
var user_description = {
  alias: 0x2901,
  name: 'gatt.characteristic_user_description',
  uuid: '00002901-0000-1000-8000-00805f9b34fb'
};
var client_characteristic_configuration = {
  alias: 0x2902,
  name: 'gatt.client_characteristic_configuration',
  uuid: '00002902-0000-1000-8000-00805f9b34fb'
};
var measurement_interval = {
  alias: 0x2a21,
  name: 'measurement_interval',
  uuid: '00002a21-0000-1000-8000-00805f9b34fb'
};

/**
 * An advertisement packet object that simulates a device.
 * @type {ScanResult}
 */
const health_thermometer_ad_packet = {
  deviceAddress: '09:09:09:09:09:09',
  rssi: -10,
  scanRecord: {
    name: 'Health Thermometer',
    uuids: [health_thermometer.uuid],
  },
};

/** Bluetooth Helpers */

/**
 * Helper class to create a BluetoothCharacteristicProperties object using an
 * array of strings corresponding to the property bit to set.
 */
class TestCharacteristicProperties {
  /** @param {Array<string>} properties */
  constructor(properties) {
    this.broadcast = false;
    this.read = false;
    this.writeWithoutResponse = false;
    this.write = false;
    this.notify = false;
    this.indicate = false;
    this.authenticatedSignedWrites = false;
    this.reliableWrite = false;
    this.writableAuxiliaries = false;

    properties.forEach(val => {
      if (this.hasOwnProperty(val))
        this[val] = true;
      else
        throw `Invalid member '${val}'`;
    });
  }
}

/**
 * Produces an array of BluetoothLEScanFilterInit objects containing the list of
 * services in |services| and various permutations of the other
 * BluetoothLEScanFilterInit properties. This method is used to test that the
 * |services| are valid so the other properties do not matter.
 * @param {BluetoothServiceUUID} services
 * @returns {Array<RequestDeviceOptions>} A list of options containing
 *     |services| and various permutations of other options.
 */
function generateRequestDeviceArgsWithServices(services = ['heart_rate']) {
  return [
    {filters: [{services: services}]},
    {filters: [{services: services, name: 'Name'}]},
    {filters: [{services: services, namePrefix: 'Pre'}]},
    {filters: [{services: services, name: 'Name', namePrefix: 'Pre'}]},
    {filters: [{services: services}], optionalServices: ['heart_rate']}, {
      filters: [{services: services, name: 'Name'}],
      optionalServices: ['heart_rate']
    },
    {
      filters: [{services: services, namePrefix: 'Pre'}],
      optionalServices: ['heart_rate']
    },
    {
      filters: [{services: services, name: 'Name', namePrefix: 'Pre'}],
      optionalServices: ['heart_rate']
    }
  ];
}

/**
 * Causes |fake_peripheral| to disconnect and returns a promise that resolves
 * once `gattserverdisconnected` has been fired on |device|.
 * @param {BluetoothDevice} device The device to check if the
 *     `gattserverdisconnected` promise was fired.
 * @param {FakePeripheral} fake_peripheral The device fake that represents
 *     |device|.
 * @returns {Promise<Array<Object>>} A promise that resolves when the device has
 *     successfully disconnected.
 */
function simulateGATTDisconnectionAndWait(device, fake_peripheral) {
  return Promise.all([
    eventPromise(device, 'gattserverdisconnected'),
    fake_peripheral.simulateGATTDisconnection(),
  ]);
}

/**
 * Returns an array containing two FakePeripherals corresponding
 * to the simulated devices.
 * @returns {Promise<Array<FakePeripheral>>} The fake devices are initialized as
 *     Health Thermometer and Heart Rate devices.
 */
function setUpHealthThermometerAndHeartRateDevices() {
  return navigator.bluetooth.test.simulateCentral({state: 'powered-on'})
      .then(fake_central => Promise.all([
        fake_central.simulatePreconnectedPeripheral({
          address: '09:09:09:09:09:09',
          name: 'Health Thermometer',
          knownServiceUUIDs: ['generic_access', 'health_thermometer'],
        }),
        fake_central.simulatePreconnectedPeripheral({
          address: '08:08:08:08:08:08',
          name: 'Heart Rate',
          knownServiceUUIDs: ['generic_access', 'heart_rate'],
        })
      ]));
}

/**
 * Simulates a pre-connected device with |address|, |name| and
 * |knownServiceUUIDs|.
 * @param {string} address The device MAC address.
 * @param {string} name The device name.
 * @param {Array<string>} knownServiceUUIDs An array of GATT service UUIDs to
 *     set up the fake with.
 * @returns {Promise<FakePeripheral>} The fake devices are initialized with the
 *     parameter values.
 */
function setUpPreconnectedDevice({
  address = '00:00:00:00:00:00',
  name = 'LE Device',
  knownServiceUUIDs = []
}) {
  return navigator.bluetooth.test.simulateCentral({state: 'powered-on'})
      .then(fake_central => fake_central.simulatePreconnectedPeripheral({
        address: address,
        name: name,
        knownServiceUUIDs: knownServiceUUIDs,
      }));
}

/** Blocklisted GATT Device Helper Methods */

/**
 * Returns an object containing a BluetoothDevice discovered using |options|,
 * its corresponding FakePeripheral and FakeRemoteGATTServices.
 * The simulated device is called 'Blocklist Device' and it has one known
 * service UUID |blocklist_test_service_uuid|. The |blocklist_test_service_uuid|
 * service contains two characteristics:
 *   - |blocklist_exclude_reads_characteristic_uuid| (read, write)
 *   - 'gap.peripheral_privacy_flag' (read, write)
 * The 'gap.peripheral_privacy_flag' characteristic contains three descriptors:
 *   - |blocklist_test_descriptor_uuid|
 *   - |blocklist_exclude_reads_descriptor_uuid|
 *   - 'gatt.client_characteristic_configuration'
 * These are special UUIDs that have been added to the blocklist found at
 * https://github.com/WebBluetoothCG/registries/blob/master/gatt_blocklist.txt
 * There are also test UUIDs that have been added to the test environment which
 * other implementations should add as test UUIDs as well.
 * The device has been connected to and its attributes are ready to be
 * discovered.
 * @returns {Promise<{device: BluetoothDevice, fake_peripheral: FakePeripheral,
 *     fake_blocklist_test_service: FakeRemoteGATTService,
 *     fake_blocklist_exclude_reads_characteristic:
 *         FakeRemoteGATTCharacteristic,
 *     fake_blocklist_exclude_writes_characteristic:
 *         FakeRemoteGATTCharacteristic,
 *     fake_blocklist_descriptor: FakeRemoteGATTDescriptor,
 *     fake_blocklist_exclude_reads_descriptor: FakeRemoteGATTDescriptor,
 *     fake_blocklist_exclude_writes_descriptor: FakeRemoteGATTDescriptor}>} An
 *         object containing the BluetoothDevice object and its corresponding
 *         GATT fake objects.
 */
function getBlocklistDevice(options = {
  filters: [{services: [blocklist_test_service_uuid]}]
}) {
  let device, fake_peripheral, fake_blocklist_test_service,
      fake_blocklist_exclude_reads_characteristic,
      fake_blocklist_exclude_writes_characteristic, fake_blocklist_descriptor,
      fake_blocklist_exclude_reads_descriptor,
      fake_blocklist_exclude_writes_descriptor;
  return setUpPreconnectedDevice({
           address: '11:11:11:11:11:11',
           name: 'Blocklist Device',
           knownServiceUUIDs: ['generic_access', blocklist_test_service_uuid],
         })
      .then(_ => fake_peripheral = _)
      .then(() => requestDeviceWithTrustedClick(options))
      .then(_ => device = _)
      .then(() => fake_peripheral.setNextGATTConnectionResponse({
        code: HCI_SUCCESS,
      }))
      .then(() => device.gatt.connect())
      .then(() => fake_peripheral.addFakeService({
        uuid: blocklist_test_service_uuid,
      }))
      .then(_ => fake_blocklist_test_service = _)
      .then(() => fake_blocklist_test_service.addFakeCharacteristic({
        uuid: blocklist_exclude_reads_characteristic_uuid,
        properties: ['read', 'write'],
      }))
      .then(_ => fake_blocklist_exclude_reads_characteristic = _)
      .then(() => fake_blocklist_test_service.addFakeCharacteristic({
        uuid: 'gap.peripheral_privacy_flag',
        properties: ['read', 'write'],
      }))
      .then(_ => fake_blocklist_exclude_writes_characteristic = _)
      .then(
          () => fake_blocklist_exclude_writes_characteristic.addFakeDescriptor(
              {uuid: blocklist_test_descriptor_uuid}))
      .then(_ => fake_blocklist_descriptor = _)
      .then(
          () => fake_blocklist_exclude_writes_characteristic.addFakeDescriptor(
              {uuid: blocklist_exclude_reads_descriptor_uuid}))
      .then(_ => fake_blocklist_exclude_reads_descriptor = _)
      .then(
          () => fake_blocklist_exclude_writes_characteristic.addFakeDescriptor(
              {uuid: 'gatt.client_characteristic_configuration'}))
      .then(_ => fake_blocklist_exclude_writes_descriptor = _)
      .then(() => fake_peripheral.setNextGATTDiscoveryResponse({
        code: HCI_SUCCESS,
      }))
      .then(() => ({
              device,
              fake_peripheral,
              fake_blocklist_test_service,
              fake_blocklist_exclude_reads_characteristic,
              fake_blocklist_exclude_writes_characteristic,
              fake_blocklist_descriptor,
              fake_blocklist_exclude_reads_descriptor,
              fake_blocklist_exclude_writes_descriptor,
            }));
}

/**
 * Returns an object containing a Blocklist Test BluetoothRemoveGattService and
 * its corresponding FakeRemoteGATTService.
 * @returns {Promise<{device: BluetoothDevice, fake_peripheral: FakePeripheral,
 *     fake_blocklist_test_service: FakeRemoteGATTService,
 *     fake_blocklist_exclude_reads_characteristic:
 *         FakeRemoteGATTCharacteristic,
 *     fake_blocklist_exclude_writes_characteristic:
 *         FakeRemoteGATTCharacteristic,
 *     fake_blocklist_descriptor: FakeRemoteGATTDescriptor,
 *     fake_blocklist_exclude_reads_descriptor: FakeRemoteGATTDescriptor,
 *     fake_blocklist_exclude_writes_descriptor: FakeRemoteGATTDescriptor,
 *     service: BluetoothRemoteGATTService,
 *     fake_service: FakeBluetoothRemoteGATTService}>} An object containing the
 *         BluetoothDevice object and its corresponding GATT fake objects.
 */
function getBlocklistTestService() {
  let result;
  return getBlocklistDevice()
      .then(_ => result = _)
      .then(
          () =>
              result.device.gatt.getPrimaryService(blocklist_test_service_uuid))
      .then(service => Object.assign(result, {
        service,
        fake_service: result.fake_blocklist_test_service,
      }));
}

/**
 * Returns an object containing a blocklisted BluetoothRemoteGATTCharacteristic
 * that excludes reads and its corresponding FakeRemoteGATTCharacteristic.
 * @returns {Promise<{device: BluetoothDevice, fake_peripheral: FakePeripheral,
 *     fake_blocklist_test_service: FakeRemoteGATTService,
 *     fake_blocklist_exclude_reads_characteristic:
 *         FakeRemoteGATTCharacteristic,
 *     fake_blocklist_exclude_writes_characteristic:
 *         FakeRemoteGATTCharacteristic,
 *     fake_blocklist_descriptor: FakeRemoteGATTDescriptor,
 *     fake_blocklist_exclude_reads_descriptor: FakeRemoteGATTDescriptor,
 *     fake_blocklist_exclude_writes_descriptor: FakeRemoteGATTDescriptor,
 *     service: BluetoothRemoteGATTService,
 *     fake_service: FakeBluetoothRemoteGATTService,
 *     characteristic: BluetoothRemoteGATTCharacteristic,
 *     fake_characteristic: FakeBluetoothRemoteGATTCharacteristic}>} An object
 *         containing the BluetoothDevice object and its corresponding GATT fake
 *         objects.
 */
function getBlocklistExcludeReadsCharacteristic() {
  let result, fake_characteristic;
  return getBlocklistTestService()
      .then(_ => result = _)
      .then(
          () => result.service.getCharacteristic(
              blocklist_exclude_reads_characteristic_uuid))
      .then(characteristic => Object.assign(result, {
        characteristic,
        fake_characteristic: result.fake_blocklist_exclude_reads_characteristic
      }));
}

/**
 * Returns an object containing a blocklisted BluetoothRemoteGATTCharacteristic
 * that excludes writes and its corresponding FakeRemoteGATTCharacteristic.
 * @returns {Promise<{device: BluetoothDevice, fake_peripheral: FakePeripheral,
 *     fake_blocklist_test_service: FakeRemoteGATTService,
 *     fake_blocklist_exclude_reads_characteristic:
 *         FakeRemoteGATTCharacteristic,
 *     fake_blocklist_exclude_writes_characteristic:
 *         FakeRemoteGATTCharacteristic,
 *     fake_blocklist_descriptor: FakeRemoteGATTDescriptor,
 *     fake_blocklist_exclude_reads_descriptor: FakeRemoteGATTDescriptor,
 *     fake_blocklist_exclude_writes_descriptor: FakeRemoteGATTDescriptor,
 *     service: BluetoothRemoteGATTService,
 *     fake_service: FakeBluetoothRemoteGATTService,
 *     characteristic: BluetoothRemoteGATTCharacteristic,
 *     fake_characteristic: FakeBluetoothRemoteGATTCharacteristic}>} An object
 *         containing the BluetoothDevice object and its corresponding GATT fake
 *         objects.
 */
function getBlocklistExcludeWritesCharacteristic() {
  let result, fake_characteristic;
  return getBlocklistTestService()
      .then(_ => result = _)
      .then(
          () => result.service.getCharacteristic('gap.peripheral_privacy_flag'))
      .then(characteristic => Object.assign(result, {
        characteristic,
        fake_characteristic: result.fake_blocklist_exclude_writes_characteristic
      }));
}

/**
 * Returns an object containing a blocklisted BluetoothRemoteGATTDescriptor that
 * excludes reads and its corresponding FakeRemoteGATTDescriptor.
 * @returns {Promise<{device: BluetoothDevice, fake_peripheral: FakePeripheral,
 *     fake_blocklist_test_service: FakeRemoteGATTService,
 *     fake_blocklist_exclude_reads_characteristic:
 *         FakeRemoteGATTCharacteristic,
 *     fake_blocklist_exclude_writes_characteristic:
 *         FakeRemoteGATTCharacteristic,
 *     fake_blocklist_descriptor: FakeRemoteGATTDescriptor,
 *     fake_blocklist_exclude_reads_descriptor: FakeRemoteGATTDescriptor,
 *     fake_blocklist_exclude_writes_descriptor: FakeRemoteGATTDescriptor,
 *     service: BluetoothRemoteGATTService,
 *     fake_service: FakeBluetoothRemoteGATTService,
 *     characteristic: BluetoothRemoteGATTCharacteristic,
 *     fake_characteristic: FakeBluetoothRemoteGATTCharacteristic,
 *     descriptor: BluetoothRemoteGATTDescriptor,
 *     fake_descriptor: FakeBluetoothRemoteGATTDescriptor}>} An object
 *         containing the BluetoothDevice object and its corresponding GATT fake
 *         objects.
 */
function getBlocklistExcludeReadsDescriptor() {
  let result;
  return getBlocklistExcludeWritesCharacteristic()
      .then(_ => result = _)
      .then(
          () => result.characteristic.getDescriptor(
              blocklist_exclude_reads_descriptor_uuid))
      .then(descriptor => Object.assign(result, {
        descriptor,
        fake_descriptor: result.fake_blocklist_exclude_reads_descriptor
      }));
}

/**
 * Returns an object containing a blocklisted BluetoothRemoteGATTDescriptor that
 * excludes writes and its corresponding FakeRemoteGATTDescriptor.
 * @returns {Promise<{device: BluetoothDevice, fake_peripheral: FakePeripheral,
 *     fake_blocklist_test_service: FakeRemoteGATTService,
 *     fake_blocklist_exclude_reads_characteristic:
 *         FakeRemoteGATTCharacteristic,
 *     fake_blocklist_exclude_writes_characteristic:
 *         FakeRemoteGATTCharacteristic,
 *     fake_blocklist_descriptor: FakeRemoteGATTDescriptor,
 *     fake_blocklist_exclude_reads_descriptor: FakeRemoteGATTDescriptor,
 *     fake_blocklist_exclude_writes_descriptor: FakeRemoteGATTDescriptor,
 *     service: BluetoothRemoteGATTService,
 *     fake_service: FakeBluetoothRemoteGATTService,
 *     characteristic: BluetoothRemoteGATTCharacteristic,
 *     fake_characteristic: FakeBluetoothRemoteGATTCharacteristic,
 *     descriptor: BluetoothRemoteGATTDescriptor,
 *     fake_descriptor: FakeBluetoothRemoteGATTDescriptor}>} An object
 *         containing the BluetoothDevice object and its corresponding GATT fake
 *         objects.
 */
function getBlocklistExcludeWritesDescriptor() {
  let result;
  return getBlocklistExcludeWritesCharacteristic()
      .then(_ => result = _)
      .then(
          () => result.characteristic.getDescriptor(
              'gatt.client_characteristic_configuration'))
      .then(descriptor => Object.assign(result, {
        descriptor: descriptor,
        fake_descriptor: result.fake_blocklist_exclude_writes_descriptor,
      }));
}

/** Bluetooth HID Device Helper Methods */

/**
 * Similar to getHealthThermometerDevice except the GATT discovery
 * response has not been set yet so more attributes can still be added.
 * TODO(crbug.com/719816): Add descriptors.
 * @param {RequestDeviceOptions} options The options for requesting a Bluetooth
 *     Device.
 * @returns {device: BluetoothDevice, fake_peripheral: FakePeripheral} An object
 *     containing a requested BluetoothDevice and its fake counter part.
 */
function getConnectedHIDDevice(options) {
  let device, fake_peripheral;
  return setUpPreconnectedDevice({
           address: '10:10:10:10:10:10',
           name: 'HID Device',
           knownServiceUUIDs: [
             'generic_access',
             'device_information',
             'human_interface_device',
           ],
         })
      .then(_ => (fake_peripheral = _))
      .then(() => requestDeviceWithTrustedClick(options))
      .then(_ => (device = _))
      .then(() => fake_peripheral.setNextGATTConnectionResponse({
        code: HCI_SUCCESS,
      }))
      .then(() => device.gatt.connect())
      .then(() => fake_peripheral.addFakeService({
        uuid: 'generic_access',
      }))
      .then(() => fake_peripheral.addFakeService({
        uuid: 'device_information',
      }))
      // Blocklisted Characteristic:
      // https://github.com/WebBluetoothCG/registries/blob/master/gatt_blocklist.txt
      .then(dev_info => dev_info.addFakeCharacteristic({
        uuid: 'serial_number_string',
        properties: ['read'],
      }))
      .then(() => fake_peripheral.addFakeService({
        uuid: 'human_interface_device',
      }))
      .then(() => ({device, fake_peripheral}));
}

/**
 * Returns a BluetoothDevice discovered using |options| and its
 * corresponding FakePeripheral.
 * The simulated device is called 'HID Device' it has three known service
 * UUIDs: 'generic_access', 'device_information', 'human_interface_device'.
 * The primary service with 'device_information' UUID has a characteristics
 * with UUID 'serial_number_string'. The device has been connected to and its
 * attributes are ready to be discovered.
 * @param {RequestDeviceOptions} options The options for requesting a Bluetooth
 *     Device.
 * @returns {device: BluetoothDevice, fake_peripheral: FakePeripheral} An object
 *     containing a requested BluetoothDevice and its fake counter part.
 */
function getHIDDevice(options) {
  let device, fake_peripheral;
  return getConnectedHIDDevice(options)
      .then(_ => ({device, fake_peripheral} = _))
      .then(() => fake_peripheral.setNextGATTDiscoveryResponse({
        code: HCI_SUCCESS,
      }))
      .then(() => ({device, fake_peripheral}));
}

/** Health Thermometer Bluetooth Device Helper Methods */

/**
 * Returns a FakePeripheral that corresponds to a simulated pre-connected device
 * called 'Health Thermometer'. The device has two known serviceUUIDs:
 * 'generic_access' and 'health_thermometer'.
 * @returns {FakePeripheral} The device fake initialized as a Health
 *     Thermometer device.
 */
function setUpHealthThermometerDevice() {
  return setUpPreconnectedDevice({
    address: '09:09:09:09:09:09',
    name: 'Health Thermometer',
    knownServiceUUIDs: ['generic_access', 'health_thermometer'],
  });
}

/**
 * Returns the same fake peripheral as setUpHealthThermometerDevice() except
 * that connecting to the peripheral will succeed.
 * @returns {Promise<FakePeripheral>} The device fake initialized as a
 *     connectable Health Thermometer device.
 */
function setUpConnectableHealthThermometerDevice() {
  let fake_peripheral;
  return setUpHealthThermometerDevice()
      .then(_ => fake_peripheral = _)
      .then(() => fake_peripheral.setNextGATTConnectionResponse({
        code: HCI_SUCCESS,
      }))
      .then(() => fake_peripheral);
}

/**
 * Populates a fake_peripheral with various fakes appropriate for a health
 * thermometer. This resolves to an associative array composed of the fakes,
 * including the |fake_peripheral|.
 * @param {FakePeripheral} fake_peripheral The Bluetooth fake to populate GATT
 *     services, characteristics, and descriptors on.
 * @returns {Promise<{fake_peripheral: FakePeripheral,
 *     fake_generic_access: FakeRemoteGATTService,
 *     fake_health_thermometer: FakeRemoteGATTService,
 *     fake_measurement_interval: FakeRemoteGATTCharacteristic,
 *     fake_cccd: FakeRemoteGATTDescriptor,
 *     fake_user_description: FakeRemoteGATTDescriptor,
 *     fake_temperature_measurement: FakeRemoteGATTCharacteristic,
 *     fake_temperature_type: FakeRemoteGATTCharacteristic}>} The FakePeripheral
 * passed into this method along with the fake GATT services, characteristics,
 *         and descriptors added to it.
 */
function populateHealthThermometerFakes(fake_peripheral) {
  let fake_generic_access, fake_health_thermometer, fake_measurement_interval,
      fake_user_description, fake_cccd, fake_temperature_measurement,
      fake_temperature_type;
  return fake_peripheral.addFakeService({uuid: 'generic_access'})
      .then(_ => fake_generic_access = _)
      .then(() => fake_peripheral.addFakeService({
        uuid: 'health_thermometer',
      }))
      .then(_ => fake_health_thermometer = _)
      .then(() => fake_health_thermometer.addFakeCharacteristic({
        uuid: 'measurement_interval',
        properties: ['read', 'write', 'indicate'],
      }))
      .then(_ => fake_measurement_interval = _)
      .then(() => fake_measurement_interval.addFakeDescriptor({
        uuid: 'gatt.characteristic_user_description',
      }))
      .then(_ => fake_user_description = _)
      .then(() => fake_measurement_interval.addFakeDescriptor({
        uuid: 'gatt.client_characteristic_configuration',
      }))
      .then(_ => fake_cccd = _)
      .then(() => fake_health_thermometer.addFakeCharacteristic({
        uuid: 'temperature_measurement',
        properties: ['indicate'],
      }))
      .then(_ => fake_temperature_measurement = _)
      .then(() => fake_health_thermometer.addFakeCharacteristic({
        uuid: 'temperature_type',
        properties: ['read'],
      }))
      .then(_ => fake_temperature_type = _)
      .then(() => ({
              fake_peripheral,
              fake_generic_access,
              fake_health_thermometer,
              fake_measurement_interval,
              fake_cccd,
              fake_user_description,
              fake_temperature_measurement,
              fake_temperature_type,
            }));
}

/**
 * Returns the same device and fake peripheral as getHealthThermometerDevice()
 * after another frame (an iframe we insert) discovered the device,
 * connected to it and discovered its services.
 * @param {RequestDeviceOptions} options The options for requesting a Bluetooth
 *     Device.
 * @returns {Promise<{device: BluetoothDevice, fakes: {
 *         fake_peripheral: FakePeripheral,
 *         fake_generic_access: FakeRemoteGATTService,
 *         fake_health_thermometer: FakeRemoteGATTService,
 *         fake_measurement_interval: FakeRemoteGATTCharacteristic,
 *         fake_cccd: FakeRemoteGATTDescriptor,
 *         fake_user_description: FakeRemoteGATTDescriptor,
 *         fake_temperature_measurement: FakeRemoteGATTCharacteristic,
 *         fake_temperature_type: FakeRemoteGATTCharacteristic}}>} An object
 *         containing a requested BluetoothDevice and all of the GATT fake
 *         objects.
 */
function getHealthThermometerDeviceWithServicesDiscovered(options) {
  let device, fake_peripheral, fakes;
  let iframe = document.createElement('iframe');
  return setUpConnectableHealthThermometerDevice()
      .then(_ => fake_peripheral = _)
      .then(() => populateHealthThermometerFakes(fake_peripheral))
      .then(_ => fakes = _)
      .then(() => fake_peripheral.setNextGATTDiscoveryResponse({
        code: HCI_SUCCESS,
      }))
      .then(
          () => new Promise(resolve => {
            let src = '/bluetooth/resources/health-thermometer-iframe.html';
            // TODO(509038): Can be removed once LayoutTests/bluetooth/* that
            // use health-thermometer-iframe.html have been moved to
            // LayoutTests/external/wpt/bluetooth/*
            if (window.location.pathname.includes('/LayoutTests/')) {
              src =
                  '../../../external/wpt/bluetooth/resources/health-thermometer-iframe.html';
            }
            iframe.src = src;
            document.body.appendChild(iframe);
            iframe.addEventListener('load', resolve);
          }))
      .then(() => new Promise((resolve, reject) => {
              callWithTrustedClick(() => {
                iframe.contentWindow.postMessage(
                    {type: 'DiscoverServices', options: options}, '*');
              });

              function messageHandler(messageEvent) {
                if (messageEvent.data == 'DiscoveryComplete') {
                  window.removeEventListener('message', messageHandler);
                  resolve();
                } else {
                  reject(new Error(`Unexpected message: ${messageEvent.data}`));
                }
              }
              window.addEventListener('message', messageHandler);
            }))
      .then(() => requestDeviceWithTrustedClick(options))
      .then(_ => device = _)
      .then(device => device.gatt.connect())
      .then(_ => Object.assign({device}, fakes));
}

/**
 * Similar to getHealthThermometerDevice() except the device
 * is not connected and thus its services have not been
 * discovered.
 * @param {RequestDeviceOptions} options The options for requesting a Bluetooth
 *     Device.
 * @returns {device: BluetoothDevice, fake_peripheral: FakePeripheral} An object
 *     containing a requested BluetoothDevice and its fake counter part.
 */
function getDiscoveredHealthThermometerDevice(options = {
  filters: [{services: ['health_thermometer']}]
}) {
  return setUpHealthThermometerDevice().then(fake_peripheral => {
    return requestDeviceWithTrustedClick(options).then(
        device => ({device: device, fake_peripheral: fake_peripheral}));
  });
}

/**
 * Similar to getHealthThermometerDevice() except the device has no services,
 * characteristics, or descriptors.
 * @param {RequestDeviceOptions} options The options for requesting a Bluetooth
 *     Device.
 * @returns {device: BluetoothDevice, fake_peripheral: FakePeripheral} An object
 *     containing a requested BluetoothDevice and its fake counter part.
 */
function getEmptyHealthThermometerDevice(options) {
  return getDiscoveredHealthThermometerDevice(options).then(
      ({device, fake_peripheral}) => {
        return fake_peripheral
            .setNextGATTConnectionResponse({code: HCI_SUCCESS})
            .then(() => device.gatt.connect())
            .then(
                () => fake_peripheral.setNextGATTDiscoveryResponse(
                    {code: HCI_SUCCESS}))
            .then(() => ({device: device, fake_peripheral: fake_peripheral}));
      });
}

/**
 * Similar to getHealthThermometerService() except the service has no
 * characteristics or included services.
 * @param {RequestDeviceOptions} options The options for requesting a Bluetooth
 *     Device.
 * @returns {service: BluetoothRemoteGATTService,
 *     fake_health_thermometer: FakeRemoteGATTService} An object containing the
 * health themometer service object and its corresponding fake.
 */
function getEmptyHealthThermometerService(options) {
  let device;
  let fake_peripheral;
  let fake_health_thermometer;
  return getDiscoveredHealthThermometerDevice(options)
      .then(result => ({device, fake_peripheral} = result))
      .then(
          () => fake_peripheral.setNextGATTConnectionResponse(
              {code: HCI_SUCCESS}))
      .then(() => device.gatt.connect())
      .then(() => fake_peripheral.addFakeService({uuid: 'health_thermometer'}))
      .then(s => fake_health_thermometer = s)
      .then(
          () =>
              fake_peripheral.setNextGATTDiscoveryResponse({code: HCI_SUCCESS}))
      .then(() => device.gatt.getPrimaryService('health_thermometer'))
      .then(service => ({
              service: service,
              fake_health_thermometer: fake_health_thermometer,
            }));
}

/**
 * Similar to getHealthThermometerDevice except the GATT discovery
 * response has not been set yet so more attributes can still be added.
 * @param {RequestDeviceOptions} options The options for requesting a Bluetooth
 *     Device.
 * @returns {Promise<{device: BluetoothDevice, fakes: {
 *         fake_peripheral: FakePeripheral,
 *         fake_generic_access: FakeRemoteGATTService,
 *         fake_health_thermometer: FakeRemoteGATTService,
 *         fake_measurement_interval: FakeRemoteGATTCharacteristic,
 *         fake_cccd: FakeRemoteGATTDescriptor,
 *         fake_user_description: FakeRemoteGATTDescriptor,
 *         fake_temperature_measurement: FakeRemoteGATTCharacteristic,
 *         fake_temperature_type: FakeRemoteGATTCharacteristic}}>} An object
 *         containing a requested BluetoothDevice and all of the GATT fake
 *         objects.
 */
function getConnectedHealthThermometerDevice(options) {
  let device, fake_peripheral, fakes;
  return getDiscoveredHealthThermometerDevice(options)
      .then(_ => ({device, fake_peripheral} = _))
      .then(() => fake_peripheral.setNextGATTConnectionResponse({
        code: HCI_SUCCESS,
      }))
      .then(() => populateHealthThermometerFakes(fake_peripheral))
      .then(_ => fakes = _)
      .then(() => device.gatt.connect())
      .then(() => Object.assign({device}, fakes));
}

/**
 * Returns an object containing a BluetoothDevice discovered using |options|,
 * its corresponding FakePeripheral and FakeRemoteGATTServices.
 * The simulated device is called 'Health Thermometer' it has two known service
 * UUIDs: 'generic_access' and 'health_thermometer' which correspond to two
 * services with the same UUIDs. The 'health thermometer' service contains three
 * characteristics:
 *  - 'temperature_measurement' (indicate),
 *  - 'temperature_type' (read),
 *  - 'measurement_interval' (read, write, indicate)
 * The 'measurement_interval' characteristic contains a
 * 'gatt.client_characteristic_configuration' descriptor and a
 * 'characteristic_user_description' descriptor.
 * The device has been connected to and its attributes are ready to be
 * discovered.
 * @param {RequestDeviceOptions} options The options for requesting a Bluetooth
 *     Device.
 * @returns {Promise<{device: BluetoothDevice, fakes: {
 *         fake_peripheral: FakePeripheral,
 *         fake_generic_access: FakeRemoteGATTService,
 *         fake_health_thermometer: FakeRemoteGATTService,
 *         fake_measurement_interval: FakeRemoteGATTCharacteristic,
 *         fake_cccd: FakeRemoteGATTDescriptor,
 *         fake_user_description: FakeRemoteGATTDescriptor,
 *         fake_temperature_measurement: FakeRemoteGATTCharacteristic,
 *         fake_temperature_type: FakeRemoteGATTCharacteristic}}>} An object
 *         containing a requested BluetoothDevice and all of the GATT fake
 *         objects.
 */
function getHealthThermometerDevice(options) {
  let result;
  return getConnectedHealthThermometerDevice(options)
      .then(_ => result = _)
      .then(() => result.fake_peripheral.setNextGATTDiscoveryResponse({
        code: HCI_SUCCESS,
      }))
      .then(() => result);
}

/**
 * Similar to getHealthThermometerDevice except that the peripheral has two
 * 'health_thermometer' services.
 * @param {RequestDeviceOptions} options The options for requesting a Bluetooth
 *     Device.
 * @returns {Promise<{device: BluetoothDevice, fake_peripheral: FakePeripheral,
 *     fake_generic_access: FakeRemoteGATTService, fake_health_thermometer1:
 * FakeRemoteGATTService, fake_health_thermometer2: FakeRemoteGATTService}>} An
 * object containing a requested Bluetooth device and two fake health
 * thermometer GATT services.
 */
function getTwoHealthThermometerServicesDevice(options) {
  let device;
  let fake_peripheral;
  let fake_generic_access;
  let fake_health_thermometer1;
  let fake_health_thermometer2;

  return getConnectedHealthThermometerDevice(options)
      .then(result => {
        ({
          device,
          fake_peripheral,
          fake_generic_access,
          fake_health_thermometer: fake_health_thermometer1,
        } = result);
      })
      .then(() => fake_peripheral.addFakeService({uuid: 'health_thermometer'}))
      .then(s => fake_health_thermometer2 = s)
      .then(
          () =>
              fake_peripheral.setNextGATTDiscoveryResponse({code: HCI_SUCCESS}))
      .then(() => ({
              device: device,
              fake_peripheral: fake_peripheral,
              fake_generic_access: fake_generic_access,
              fake_health_thermometer1: fake_health_thermometer1,
              fake_health_thermometer2: fake_health_thermometer2
            }));
}

/**
 * Returns an object containing a Health Thermometer BluetoothRemoteGattService
 * and its corresponding FakeRemoteGATTService.
 * @returns {Promise<{device: BluetoothDevice, fakes: {
 *         fake_peripheral: FakePeripheral,
 *         fake_generic_access: FakeRemoteGATTService,
 *         fake_health_thermometer: FakeRemoteGATTService,
 *         fake_measurement_interval: FakeRemoteGATTCharacteristic,
 *         fake_cccd: FakeRemoteGATTDescriptor,
 *         fake_user_description: FakeRemoteGATTDescriptor,
 *         fake_temperature_measurement: FakeRemoteGATTCharacteristic,
 *         fake_temperature_type: FakeRemoteGATTCharacteristic,
 *         service: BluetoothRemoteGATTService,
 *         fake_service: FakeRemoteGATTService}}>} An object
 *         containing a requested BluetoothDevice and all of the GATT fake
 *         objects.
 */
function getHealthThermometerService() {
  let result;
  return getHealthThermometerDevice()
      .then(r => result = r)
      .then(() => result.device.gatt.getPrimaryService('health_thermometer'))
      .then(service => Object.assign(result, {
        service,
        fake_service: result.fake_health_thermometer,
      }));
}

/**
 * Returns an object containing a Measurement Interval
 * BluetoothRemoteGATTCharacteristic and its corresponding
 * FakeRemoteGATTCharacteristic.
 * @returns {Promise<{device: BluetoothDevice, fakes: {
 *         fake_peripheral: FakePeripheral,
 *         fake_generic_access: FakeRemoteGATTService,
 *         fake_health_thermometer: FakeRemoteGATTService,
 *         fake_measurement_interval: FakeRemoteGATTCharacteristic,
 *         fake_cccd: FakeRemoteGATTDescriptor,
 *         fake_user_description: FakeRemoteGATTDescriptor,
 *         fake_temperature_measurement: FakeRemoteGATTCharacteristic,
 *         fake_temperature_type: FakeRemoteGATTCharacteristic,
 *         service: BluetoothRemoteGATTService,
 *         fake_service: FakeRemoteGATTService,
 *         characteristic: BluetoothRemoteGATTCharacteristic,
 *         fake_characteristic: FakeRemoteGATTCharacteristic}}>} An object
 *         containing a requested BluetoothDevice and all of the GATT fake
 *         objects.
 */
function getMeasurementIntervalCharacteristic() {
  let result;
  return getHealthThermometerService()
      .then(r => result = r)
      .then(() => result.service.getCharacteristic('measurement_interval'))
      .then(characteristic => Object.assign(result, {
        characteristic,
        fake_characteristic: result.fake_measurement_interval,
      }));
}

/**
 * Returns an object containing a User Description
 * BluetoothRemoteGATTDescriptor and its corresponding
 * FakeRemoteGATTDescriptor.
 * @returns {Promise<{device: BluetoothDevice, fakes: {
 *         fake_peripheral: FakePeripheral,
 *         fake_generic_access: FakeRemoteGATTService,
 *         fake_health_thermometer: FakeRemoteGATTService,
 *         fake_measurement_interval: FakeRemoteGATTCharacteristic,
 *         fake_cccd: FakeRemoteGATTDescriptor,
 *         fake_user_description: FakeRemoteGATTDescriptor,
 *         fake_temperature_measurement: FakeRemoteGATTCharacteristic,
 *         fake_temperature_type: FakeRemoteGATTCharacteristic,
 *         service: BluetoothRemoteGATTService,
 *         fake_service: FakeRemoteGATTService,
 *         characteristic: BluetoothRemoteGATTCharacteristic,
 *         fake_characteristic: FakeRemoteGATTCharacteristic
 *         descriptor: BluetoothRemoteGATTDescriptor,
 *         fake_descriptor: FakeRemoteGATTDescriptor}}>} An object
 *         containing a requested BluetoothDevice and all of the GATT fake
 *         objects.
 */
function getUserDescriptionDescriptor() {
  let result;
  return getMeasurementIntervalCharacteristic()
      .then(r => result = r)
      .then(
          () => result.characteristic.getDescriptor(
              'gatt.characteristic_user_description'))
      .then(descriptor => Object.assign(result, {
        descriptor,
        fake_descriptor: result.fake_user_description,
      }));
}
