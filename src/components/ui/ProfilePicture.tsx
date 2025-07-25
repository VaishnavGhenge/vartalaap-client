import {createAvatar} from '@dicebear/core';
import {initials} from '@dicebear/collection';

interface Props {
    name: string;
    className?: string;
}

export function ProfilePicture(props: Props) {
    const avatar = createAvatar(initials, {
        seed: props.name,
        radius: 50,
    });

    const svg = avatar.toString();

    return (
        <div
            className={props.className}
            dangerouslySetInnerHTML={{__html: svg}}
        />
    )
}