#!/bin/bash
#
# janus-combine.sh
# Combine multiple MJR recording files into one WeBM video file
# Author: Marnus van Niekerk - m@mjvn.net
# Dependencies:	ffmpeg with filter_comlex support
#
#	This is a raw first attempt.
#	For now it assumes the first video is the longest and the result is never longer than the first.
#	It also assumes that there are only files from one session on the target directory.
#

DEBUG=no
if [ "X$1" == "X-x" ]
then
	set -x
	DEBUG=yes
	shift
fi

# Check that at least one argument is passed and that it is a directory
if [ $# -lt 1 -o ! -d "$1" ]
then
	echo "USAGE: [-x] $0 dir [output]" >&1
	exit 1
fi

# Change to target directory
DIR="$1"
cd $DIR

# Clean up any previous attempt
/bin/rm -f *.webm *.opus

# List of video files
FILES=`/bin/ls -1 *video.mjr | sort -t- -k5 | sed 's/-video.mjr//g'`
CNT=`echo $FILES | wc -w`

# Convert all video files to WebM and OPUS and combine
# Calculate time differences in the same loop
i=0
BASEts=0
ENDts=0
dt="unknown"
DIFF=0
TMPFILE=`mktemp`
for FILE in $FILES
do
	janus-pp-rec $FILE-video.mjr $FILE-video.webm
	if [ $FILE-audio.mjr ]
	then
		janus-pp-rec $FILE-audio.mjr $FILE-audio.opus
		ffmpeg -i $FILE-audio.opus -i $FILE-video.webm -c:v copy -c:a opus -strict experimental $FILE-video-combined.webm
	else
		/bin/cp $FILE-video.webm $FILE-video-combined.webm
	fi
	start_ts=`echo $FILE | cut -f5 -d-`
	dur=`ffmpeg -i $FILE-video.webm /dev/null 2>&1 | fgrep Duration | cut -d" " -f4- | cut -d, -f1`
	dur=`date +%s%N -d "1970-01-01 $dur UTC"`
	end_ts=$(($start_ts + $dur/1000))

	# Absolute start and end of call
	if [ $BASEts = 0 ]
	then
		BASEts=$start_ts
		tmp=`echo $BASEts | cut -c1-10`
		dt=`date -d @$tmp "+%Y%m%d%H%M%S"`
	fi
	[ $end_ts -gt $ENDts ] && ENDts=$end_ts

	DIFF=$(($start_ts-$BASEts))
	DIFFms=`echo "scale=0;$DIFF/1000" | bc`
	DIFFs=`echo "scale=4;$DIFF/1000000" | bc`

	# Save variables to temp file for execution later
	echo "FILE$i=$FILE-video-combined.webm" >> $TMPFILE
	echo "DIFF$i=$DIFF" >> $TMPFILE
	echo "DIFFs$i=$DIFFs" >> $TMPFILE
	echo "DIFFms$i=$DIFFms" >> $TMPFILE
	echo "start_ts$i=$start_ts" >> $TMPFILE
	echo "end_ts$i=$end_ts" >> $TMPFILE

	i=$(($i+1))
done
TMP=$(($ENDts - $BASEts))
DURms=$(($TMP / 1000))
DURs=$(($DURms / 1000 + 1))
echo "DURms=$DURms" >> $TMPFILE
echo "DURs=$DURs" >> $TMPFILE

# Set variables saved to file during loop
[ $DEBUG == "yes" ] && cat $TMPFILE
source $TMPFILE; /bin/rm -f $TMPFILE

# Name of output file
if [ $# -gt 1 ]
then
	OUT="$2"
else
	OUT=`basename $DIR`.$dt.mp4
fi

[ -r $OUT ] && /bin/rm -f $OUT

# Now construct a command to create the combined video
if [ $CNT -eq 1 ] # Only 1 video
then
	/bin/mv $FILE0 $OUT
fi

if [ $CNT -eq 2 ] # 2 videos
then
	ffmpeg -i $FILE0 -i $FILE1 -filter_complex \
       "[0]pad=2*iw:ih[l];[1]setpts=PTS-STARTPTS+$DIFFs1/TB[1v]; [l][1v]overlay=x=W/2[v]; \
        [1]adelay=$DIFFms1|$DIFFms1[1a]; \
        [0][1a]amix=inputs=2[a]" \
       -map "[v]" -map "[a]" $OUT
fi

if [ $CNT -eq 3 ] # 3 videos
then
	ffmpeg -i $FILE0 -i $FILE1 -i $FILE2 -filter_complex \
       "[0]pad=2*iw:2*ih[l];[1]setpts=PTS-STARTPTS+$DIFFs1/TB[1v]; [l][1v]overlay=x=W/2[a]; \
        [2]setpts=PTS-STARTPTS+$DIFFs2/TB[2v]; [a][2v]overlay=y=H/2[v]; \
        [1]adelay=$DIFFms1|$DIFFms1[1a]; [2]adelay=$DIFFms2|$DIFFms2[2a]; \
        [0][1a][2a]amix=inputs=3[a]" \
       -map "[v]" -map "[a]" $OUT
fi

if [ $CNT -gt 3 ] # More than 3, combine only the first 4
then
	FILES_STR=""
	for FILE in $FILES; do
		FILES_STR="$FILES_STR -i $FILE-video-combined.webm"
	done;

	#echo "$FILES_STR"

	AUDIO_CUR=1
	AUDIO_STR=""
	while [ $AUDIO_CUR -lt $CNT ]; do
		AUDIO_STR="$AUDIO_STR [$AUDIO_CUR]adelay=\$DIFFms$AUDIO_CUR|\$DIFFms$AUDIO_CUR[$AUDIO_CUR"a"]; "
		AUDIO_CUR=$(($AUDIO_CUR + 1))
	done;

	#echo "$AUDIO_STR"
	AUDIO_MIX_CUR=1
	AUDIO_MIX_STR="[0]"
	while [ $AUDIO_MIX_CUR -lt $CNT ]; do
		AUDIO_MIX_STR="$AUDIO_MIX_STR[$AUDIO_MIX_CUR"a"]"
		AUDIO_MIX_CUR=$(($AUDIO_MIX_CUR + 1))
	done;
	AUDIO_MIX_STR="$AUDIO_MIX_STR""amix=inputs=$CNT[a]"

	CMD="ffmpeg $FILES_STR -filter_complex \
		\"[0]pad=1*iw:1*ih[v];\
			$AUDIO_STR \
			$AUDIO_MIX_STR\" \
		-map \"[v]\" -map \"[a]\" $OUT"

	echo $CMD > ./tmp_script
	chmod +x ./tmp_script
	./tmp_script
fi

FILESIZE=`get_filesize $OUT`

# Clean up
/bin/mv $OUT $OUT.protect	#safety net in case name matches below
/bin/rm -f *combined.webm *video.webm *.opus
/bin/mv $OUT.protect $OUT
[ -r ./tmp_script ] && /bin/rm -f ./tmp_script
/bin/rm -rf *.mjr

# Prepare information
ROOM_ID=`basename $(pwd) | cut -d "." -f1`
echo "ROOM_ID: $ROOM_ID"

INFO_FILE="videoroom-$ROOM_ID-info.json"
STOPTIME_FILE="videoroom-$ROOM_ID-stoptime"
HOSTNAME_FILE="videoroom-$ROOM_ID-hostname"

echo "INFO_FILE: $INFO_FILE"
echo "STOPTIME_FILE: $STOPTIME_FILE"
echo "HOSTNAME_FILE: $HOSTNAME_FILE"

record_id=$(jq -r ".record_id" $INFO_FILE)
participant_id=$(jq -r ".participant_id" $INFO_FILE)
conference_id=$(jq -r ".conference_id" $INFO_FILE)
conference_name=$(jq -r ".conference_id" $INFO_FILE)
subscriber_user_id=$(jq -r ".subscriber_user_id" $INFO_FILE)
email=$(jq -r ".email" $INFO_FILE)
is_send_email=$(jq -r ".is_send_email" $INFO_FILE)
stop_time=$(cat $STOPTIME_FILE)
host_name=$(cat $HOSTNAME_FILE)

LOGFILE="videoroom-$ROOM_ID.log"
echo "####### Collected Information #######" >> $LOGFILE
echo "record_id: $record_id" >> $LOGFILE
echo "participant_id: $participant_id" >> $LOGFILE
echo "conference_id: $conference_id" >> $LOGFILE
echo "conference_name: $conference_name" >> $LOGFILE
echo "subscriber_user_id: $subscriber_user_id" >> $LOGFILE
echo "email: $email" >> $LOGFILE
echo "is_send_email: $is_send_email" >> $LOGFILE
echo "stop_time: $stop_time" >> $LOGFILE
echo "filename: $OUT" >> $LOGFILE
echo "filesize: $FILESIZE" >> $LOGFILE
echo "hostname: $host_name" >> $LOGFILE
echo "" >> $LOGFILE

# Send cloud recording create file API
curl_command_1="curl -s --location --request POST 'https://recording-cloud-api-ts.truevirtualworld.com/api/public/v1/cloud-records' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InZyb29tLXNlcnZpY2UifQ.eyJhdWQiOlsidnJvb20tc2VydmljZSJdLCJleHAiOjE2ODAzNjU0NTcsImlhdCI6MTY0ODgwNzg1NywiaXNzIjoidnJvb20tc2VydmljZSJ9.qiC6G8RSCvr0xLnSF9ylMWO8Cl7rM_Ng5n0ID3fygX4zZ1lQ9O8ZFIP46kMxblw8_cEdQdadRq6qY76WVdhLLUVh363whwzBtiwzrDD-dcrDLzQBQKdfgnc7xBhwDwCAv7FHmWrHGE_2XqXvUGwCn_eQbHyrGJ9SdkSRyIM-Wb_7SB0R14sYatb2yCGSJ4-M4uh1SaezwG-dl89x9GgaKUSMkmrHW9RbzHaDImT7R8TmQt6BLoOfD-wdud5LVqPJxKhTWymux0yks-c2WNjBHwY9q7xgfN3kSMljvSsRaG19xqjhe1PM6NVdM_cjwn77ABg2MEhyLqCA20b4Y9nOSIR-lR-pHLMBCFMaIbF6gBzlNzwXF5wbFI2TjMdomJYiHGR2dLbtRi38QWu3OOk0K4vrh-RuGwreutd_4JGDk2rOa8njp8jC0bUKovRif3Q2-t0tf2n49sJowYmAYmShldHz2JG99o7Aopd6kzZvs5z2-mJBR-m-OhtWuvsevg61FBFNszw3aZzTU7y9YDjCXkk7Yo9xE6XglNxD8YdX5ctICmyuRzElW67sCszopllkPB21x0GbT4o8_WZ_pvvrXxbzkQuBeA7UxT6nqediXp1OdB_Nic20YK8-8pUys5uDWbE4Q0eAXJUq_dqhecn-wUz4UNHgYqPTJzKY61ard4w' \
--data-raw '{
    \"record_id\": \"$record_id\",
    \"stop_recording_date\": \"$stop_time\",
    \"file_size\" : {
        \"reference\": \"100\"
    },
    \"participant_id\": \"$participant_id\",
    \"conference_id\": \"$conference_id\",
    \"conference_name\": \"$conference_name\",
    \"subscriber_user_id\": \"$subscriber_user_id\",
    \"email\": \"$email\",
    \"file_name\": \"$OUT\",
    \"janus_hostname\": \"$host_name\"
}'"
echo $curl_command_1 >> $LOGFILE
echo "" >> $LOGFILE

echo $curl_command_1 > ./tmp_curl_command_1
chmod +x ./tmp_curl_command_1
./tmp_curl_command_1 >> $LOGFILE
/bin/rm -f ./tmp_curl_command_1
echo "" >> $LOGFILE

# Upload to cloud
CLOUD_DIR="$DIR/$ROOM_ID.$record_id.hw"
mkdir -p $CLOUD_DIR
mv $OUT $CLOUD_DIR
mv $INFO_FILE $CLOUD_DIR
upload_command="obsutil cp $CLOUD_DIR obs://th-hwc-ts-jibri/records/ -f -r -e=obs.ap-southeast-2.myhuaweicloud.com -i=HKPOSBEJGSEUMM5SQBXQ -k=6F5o7ExGojSgPKsKKKPPBckIdShUXFOrGbulHfTl"
echo "" >> $LOGFILE
echo $upload_command >> $LOGFILE
echo "" >> $LOGFILE

echo $upload_command > ./tmp_upload_command
chmod +x ./tmp_upload_command
./tmp_upload_command >> $LOGFILE
/bin/rm -f ./tmp_upload_command
echo "" >> $LOGFILE
mv $CLOUD_DIR/* $DIR
/bin/rm -rf $CLOUD_DIR

# Send cloud recording finish upload file API
curl_command_2="curl --location --request PATCH 'https://recording-cloud-api-ts.truevirtualworld.com/api/public/v1/cloud-records/$record_id' \
--header 'Content-Type: application/json' \
--header 'Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InZyb29tLXNlcnZpY2UifQ.eyJhdWQiOlsidnJvb20tc2VydmljZSJdLCJleHAiOjE2ODAzNjU0NTcsImlhdCI6MTY0ODgwNzg1NywiaXNzIjoidnJvb20tc2VydmljZSJ9.qiC6G8RSCvr0xLnSF9ylMWO8Cl7rM_Ng5n0ID3fygX4zZ1lQ9O8ZFIP46kMxblw8_cEdQdadRq6qY76WVdhLLUVh363whwzBtiwzrDD-dcrDLzQBQKdfgnc7xBhwDwCAv7FHmWrHGE_2XqXvUGwCn_eQbHyrGJ9SdkSRyIM-Wb_7SB0R14sYatb2yCGSJ4-M4uh1SaezwG-dl89x9GgaKUSMkmrHW9RbzHaDImT7R8TmQt6BLoOfD-wdud5LVqPJxKhTWymux0yks-c2WNjBHwY9q7xgfN3kSMljvSsRaG19xqjhe1PM6NVdM_cjwn77ABg2MEhyLqCA20b4Y9nOSIR-lR-pHLMBCFMaIbF6gBzlNzwXF5wbFI2TjMdomJYiHGR2dLbtRi38QWu3OOk0K4vrh-RuGwreutd_4JGDk2rOa8njp8jC0bUKovRif3Q2-t0tf2n49sJowYmAYmShldHz2JG99o7Aopd6kzZvs5z2-mJBR-m-OhtWuvsevg61FBFNszw3aZzTU7y9YDjCXkk7Yo9xE6XglNxD8YdX5ctICmyuRzElW67sCszopllkPB21x0GbT4o8_WZ_pvvrXxbzkQuBeA7UxT6nqediXp1OdB_Nic20YK8-8pUys5uDWbE4Q0eAXJUq_dqhecn-wUz4UNHgYqPTJzKY61ard4w' \
--data-raw '{
    \"stop_recording_date\": \"$stop_time\",
    \"file_size\" : {
        \"reference\": \"$FILESIZE\"
    },
    \"participant_id\": \"$participant_id\",
    \"conference_id\": \"$conference_id\",
    \"conference_name\": \"$conference_name\",
    \"subscriber_user_id\": \"$subscriber_user_id\",
    \"email\": \"$email\",
    \"file_name\": \"$OUT\",
    \"janus_hostname\": \"$host_name\",
    \"is_send_email\": \"true\"
}'"

echo $curl_command_2 >> $LOGFILE
echo "" >> $LOGFILE

echo $curl_command_2 > ./tmp_curl_command_2
chmod +x ./tmp_curl_command_2
./tmp_curl_command_2 >> $LOGFILE
/bin/rm -f ./tmp_curl_command_2
echo "" >> $LOGFILE

# Remove local copies

