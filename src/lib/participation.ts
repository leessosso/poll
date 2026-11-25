import type { BoardLamp, Participation } from '../types';

/**
 * 현장 입장(roster) 투표의 참여 현황은 현황판 번호(lamps)와 같은 데이터다.
 * 투표 시작 때 participation 과 lamp 를 같은 번호로 함께 만들고, 투표하면 같은 트랜잭션에서 둘 다 바꾼다.
 * 그래서 roster 는 participation 컬렉션을 따로 구독하지 않고 lamps 로 만든다. 이름은 participation 과 같은 'N번' 이다.
 */
export function participationFromLamps(pollId: string, lamps: BoardLamp[]): Participation[] {
  return lamps
    .filter((lamp) => lamp.pollId === pollId)
    .map((lamp) => ({
      id: `lamp_${lamp.badge}`,
      voterId: '',
      voterName: `${lamp.badge}번`,
      status: lamp.state === 'voted' ? 'completed' : 'pending',
    }) satisfies Participation)
    .sort((a, b) => (a.voterName < b.voterName ? -1 : a.voterName > b.voterName ? 1 : 0));
}
