#!/bin/bash
echo "Recordings directory: $1"
cd $1

# look for metadata (xxx-info.json) file
metadata_file=$(ls -1 *-info.json)
echo "Metadata file: $metadata_file"

# parse info.json for number of users
num_users=$(jq -r ".users | length" $metadata_file)
echo "Number of users: $num_users"

# loop on each user for information and number of sessions
for (( i=0; i<$num_users; i++ )); do
	echo "======================="
	echo "======= user $i ========"
	echo "======================="
	echo "id: $(jq -r ".users[$i].id" $metadata_file)"
	echo "name: $(jq -r ".users[$i].name" $metadata_file)"
	echo "display: $(jq -r ".users[$i].display" $metadata_file)"
	num_sessions=$(jq -r ".users[$i].sessions | length" $metadata_file)
	echo "Number of sessions: $num_sessions"
	# loop on each session for media files
	for (( j=0; j<$num_sessions; j++ )); do
		echo "------- [ session $j ] -------"
		prefix=""

		# check audio file
		audio_file=$(jq -r ".users[$i].sessions[$j].audio" $metadata_file)
		if [ $audio_file != "null" ]; then
			echo "user $i, session $j, has audio file: $audio_file"
			prefix=$(ls -1 $audio_file | sed 's/-audio.mjr//g')
			echo "---> converting audio mjr to opus: $prefix.opus"
			janus-pp-rec $audio_file $prefix.opus
		fi

		# check video file
		video_file=$(jq -r ".users[$i].sessions[$j].video" $metadata_file)
        if [ $video_file != "null" ]; then
            echo "user $i, session $j, has video file: $video_file"
			prefix=$(ls -1 $video_file | sed 's/-video.mjr//g')
			echo "---> converting video mjr to webm: $prefix.webm"
			janus-pp-rec $video_file $prefix.webm
        fi

		# check data file
		data_file=$(jq -r ".users[$i].sessions[$j].data" $metadata_file)
        if [ $data_file != "null" ]; then
            echo "user $i, session $j, has data file: $data_file, do we need to do anything? <TBC>"
        fi
		
		combined_file=$(jq -r ".users[$i].sessions[$j].combined" $metadata_file)
		# combine audio and video files, if any
		if [ $audio_file != "null" ]; then
			if [ $video_file != "null" ]; then
				# both audio and video files are present
				echo "---> combining and converting both audio and video files"
				ffmpeg -i $prefix.opus -i $prefix.webm $combined_file
			else
				# only audio file is present
				echo "---> converting only audio file"
				ffmpeg -i $prefix.opus $combined_file
			fi
		else
			if [ $video_file != "null" ]; then
				# only video file is present
				echo "---> converting only video file"
				ffmpeg -i $prefix.webm $combined_file
			else
				# neither audio nor video file is present
				echo "No media to combine or convert"
			fi
		fi
	done
done
